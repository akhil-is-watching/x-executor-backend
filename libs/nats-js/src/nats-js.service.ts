import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AckPolicy,
  connect,
  DeliverPolicy,
  type ConsumerMessages,
  type JetStreamClient,
  type JetStreamManager,
  type JsMsg,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from 'nats';
import type { NatsDlqMessage } from './nats-dlq.message';
import {
  NATS_DLQ_STREAM_NAME,
  NATS_DLQ_STREAM_SUBJECTS,
  NATS_MAX_DELIVER,
  NATS_STREAM_NAME,
  NATS_STREAM_SUBJECTS,
  natsDlqSubject,
} from './nats.constants';

export interface JsonConsumerOptions<T> {
  filterSubject: string;
  durable: string;
  handler: (payload: T) => Promise<void>;
}

@Injectable()
export class NatsJsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NatsJsService.name);
  private nc!: NatsConnection;
  private js!: JetStreamClient;
  private readonly stopFns: Array<() => Promise<void>> = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.getOrThrow<string>('NATS_URL');
    this.nc = await connect({ servers: url });
    this.js = this.nc.jetstream();

    const jsm = await this.nc.jetstreamManager();
    await this.ensureStream(jsm, NATS_STREAM_NAME, [...NATS_STREAM_SUBJECTS]);
    await this.ensureStream(jsm, NATS_DLQ_STREAM_NAME, [...NATS_DLQ_STREAM_SUBJECTS]);
    this.logger.log(
      `NATS JetStream ready (stream=${NATS_STREAM_NAME}, url=${url})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.stopFns.map((stop) => stop()));
    if (this.nc) {
      await this.nc.drain();
    }
  }

  async publish(subject: string, data: Uint8Array | string): Promise<void> {
    await this.js.publish(subject, data);
  }

  async publishJson(subject: string, payload: unknown): Promise<void> {
    await this.publish(subject, JSON.stringify(payload));
  }

  async startJsonConsumer<T>(options: JsonConsumerOptions<T>): Promise<void> {
    const streamName = NATS_STREAM_NAME;
    const jsm = await this.nc.jetstreamManager();
    await this.ensureConsumer(
      jsm,
      streamName,
      options.filterSubject,
      options.durable,
    );

    const consumer = await this.js.consumers.get(streamName, options.durable);
    const messages = await consumer.consume();

    const stop = async () => {
      await messages.close();
    };
    this.stopFns.push(stop);

    void this.runConsumerLoop(messages, options).catch((err) => {
      this.logger.error(
        `Consumer ${options.durable} loop exited on ${options.filterSubject}`,
        err instanceof Error ? err.stack : String(err),
      );
    });
  }

  private async runConsumerLoop<T>(
    messages: ConsumerMessages,
    options: JsonConsumerOptions<T>,
  ): Promise<void> {
    this.logger.log(
      `Consumer ${options.durable} listening on ${options.filterSubject}`,
    );

    for await (const msg of messages) {
      const deliveryCount = msg.info.deliveryCount;

      try {
        const payload = JSON.parse(msg.string()) as T;
        await options.handler(payload);
        msg.ack();
      } catch (err) {
        const errorText = err instanceof Error ? err.message : String(err);

        if (deliveryCount >= NATS_MAX_DELIVER) {
          await this.publishToDlq(msg, options, deliveryCount, errorText);
          msg.term(`max deliver (${NATS_MAX_DELIVER}) exceeded: ${errorText}`);
          continue;
        }

        this.logger.error(
          `Consumer ${options.durable} failed on ${options.filterSubject} (delivery ${deliveryCount}/${NATS_MAX_DELIVER})`,
          err instanceof Error ? err.stack : errorText,
        );
        msg.nak();
      }
    }
  }

  private async publishToDlq<T>(
    msg: JsMsg,
    options: JsonConsumerOptions<T>,
    deliveryCount: number,
    errorText: string,
  ): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(msg.string());
    } catch {
      payload = msg.string();
    }

    const dlqSubject = natsDlqSubject(options.filterSubject);
    const envelope: NatsDlqMessage = {
      stream: NATS_STREAM_NAME,
      originalSubject: msg.subject,
      filterSubject: options.filterSubject,
      durable: options.durable,
      deliveryCount,
      failedAt: new Date().toISOString(),
      error: errorText,
      payload,
    };

    await this.publishJson(dlqSubject, envelope);
    this.logger.warn(
      `Published to DLQ ${dlqSubject} (durable=${options.durable}, deliveries=${deliveryCount})`,
    );
  }

  private async ensureStream(
    jsm: JetStreamManager,
    streamName: string,
    subjectPatterns: string[],
  ): Promise<void> {
    try {
      await jsm.streams.info(streamName);
      await jsm.streams.update(streamName, { subjects: subjectPatterns });
    } catch {
      await jsm.streams.add({
        name: streamName,
        subjects: subjectPatterns,
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
      });
    }
  }

  private async ensureConsumer(
    jsm: JetStreamManager,
    streamName: string,
    filterSubject: string,
    durable: string,
  ): Promise<void> {
    try {
      await jsm.consumers.info(streamName, durable);
    } catch {
      await jsm.consumers.add(streamName, {
        durable_name: durable,
        filter_subject: filterSubject,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.All,
        max_deliver: NATS_MAX_DELIVER,
      });
    }
  }
}
