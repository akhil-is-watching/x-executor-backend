"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var NatsJsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsJsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nats_1 = require("nats");
const nats_constants_1 = require("./nats.constants");
let NatsJsService = NatsJsService_1 = class NatsJsService {
    config;
    logger = new common_1.Logger(NatsJsService_1.name);
    nc;
    js;
    stopFns = [];
    constructor(config) {
        this.config = config;
    }
    async onModuleInit() {
        const url = this.config.getOrThrow('NATS_URL');
        this.nc = await (0, nats_1.connect)({ servers: url });
        this.js = this.nc.jetstream();
        const jsm = await this.nc.jetstreamManager();
        await this.ensureStream(jsm, nats_constants_1.NATS_STREAM_NAME, [...nats_constants_1.NATS_STREAM_SUBJECTS]);
        await this.ensureStream(jsm, nats_constants_1.NATS_DLQ_STREAM_NAME, [...nats_constants_1.NATS_DLQ_STREAM_SUBJECTS]);
    }
    async onModuleDestroy() {
        await Promise.all(this.stopFns.map((stop) => stop()));
        if (this.nc) {
            await this.nc.drain();
        }
    }
    async publish(subject, data) {
        await this.js.publish(subject, data);
    }
    async publishJson(subject, payload) {
        await this.publish(subject, JSON.stringify(payload));
    }
    async startJsonConsumer(options) {
        const streamName = nats_constants_1.NATS_STREAM_NAME;
        const jsm = await this.nc.jetstreamManager();
        await this.ensureConsumer(jsm, streamName, options.filterSubject, options.durable);
        const consumer = await this.js.consumers.get(streamName, options.durable);
        const messages = await consumer.consume();
        const stop = async () => {
            await messages.close();
        };
        this.stopFns.push(stop);
        void this.runConsumerLoop(messages, options);
    }
    async runConsumerLoop(messages, options) {
        for await (const msg of messages) {
            const deliveryCount = msg.info.deliveryCount;
            try {
                const payload = JSON.parse(msg.string());
                await options.handler(payload);
                msg.ack();
            }
            catch (err) {
                const errorText = err instanceof Error ? err.message : String(err);
                if (deliveryCount >= nats_constants_1.NATS_MAX_DELIVER) {
                    await this.publishToDlq(msg, options, deliveryCount, errorText);
                    msg.term(`max deliver (${nats_constants_1.NATS_MAX_DELIVER}) exceeded: ${errorText}`);
                    continue;
                }
                this.logger.error(`Consumer ${options.durable} failed on ${options.filterSubject} (delivery ${deliveryCount}/${nats_constants_1.NATS_MAX_DELIVER})`, err instanceof Error ? err.stack : errorText);
                msg.nak();
            }
        }
    }
    async publishToDlq(msg, options, deliveryCount, errorText) {
        let payload;
        try {
            payload = JSON.parse(msg.string());
        }
        catch {
            payload = msg.string();
        }
        const dlqSubject = (0, nats_constants_1.natsDlqSubject)(options.filterSubject);
        const envelope = {
            stream: nats_constants_1.NATS_STREAM_NAME,
            originalSubject: msg.subject,
            filterSubject: options.filterSubject,
            durable: options.durable,
            deliveryCount,
            failedAt: new Date().toISOString(),
            error: errorText,
            payload,
        };
        await this.publishJson(dlqSubject, envelope);
        this.logger.warn(`Published to DLQ ${dlqSubject} (durable=${options.durable}, deliveries=${deliveryCount})`);
    }
    async ensureStream(jsm, streamName, subjectPatterns) {
        try {
            await jsm.streams.info(streamName);
            await jsm.streams.update(streamName, { subjects: subjectPatterns });
        }
        catch {
            await jsm.streams.add({
                name: streamName,
                subjects: subjectPatterns,
                retention: nats_1.RetentionPolicy.Limits,
                storage: nats_1.StorageType.File,
            });
        }
    }
    async ensureConsumer(jsm, streamName, filterSubject, durable) {
        try {
            await jsm.consumers.info(streamName, durable);
        }
        catch {
            await jsm.consumers.add(streamName, {
                durable_name: durable,
                filter_subject: filterSubject,
                ack_policy: nats_1.AckPolicy.Explicit,
                deliver_policy: nats_1.DeliverPolicy.All,
                max_deliver: nats_constants_1.NATS_MAX_DELIVER,
            });
        }
    }
};
exports.NatsJsService = NatsJsService;
exports.NatsJsService = NatsJsService = NatsJsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], NatsJsService);
//# sourceMappingURL=nats-js.service.js.map