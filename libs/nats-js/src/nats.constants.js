"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NATS_MAX_DELIVER = exports.NATS_DURABLE_PROCESSOR_WEBHOOK = exports.NATS_SUBJECT_DM_REPLY_READY = exports.NATS_SUBJECT_WEBHOOK_RECEIVED = exports.NATS_DLQ_STREAM_SUBJECTS = exports.NATS_DLQ_SUBJECT_PREFIX = exports.NATS_DLQ_STREAM_NAME = exports.NATS_STREAM_SUBJECTS = exports.NATS_STREAM_NAME = void 0;
exports.natsDlqSubject = natsDlqSubject;
exports.NATS_STREAM_NAME = 'X_EVENTS';
exports.NATS_STREAM_SUBJECTS = ['x.webhook.>', 'x.dm.>'];
exports.NATS_DLQ_STREAM_NAME = 'X_EVENTS_DLQ';
exports.NATS_DLQ_SUBJECT_PREFIX = 'x.dlq';
exports.NATS_DLQ_STREAM_SUBJECTS = ['x.dlq.>'];
exports.NATS_SUBJECT_WEBHOOK_RECEIVED = 'x.webhook.received';
exports.NATS_SUBJECT_DM_REPLY_READY = 'x.dm.reply.ready';
exports.NATS_DURABLE_PROCESSOR_WEBHOOK = 'processor-webhook';
exports.NATS_MAX_DELIVER = 5;
function natsDlqSubject(sourceSubject) {
    if (sourceSubject.startsWith(`${exports.NATS_DLQ_SUBJECT_PREFIX}.`)) {
        return sourceSubject;
    }
    if (sourceSubject.startsWith('x.')) {
        return `${exports.NATS_DLQ_SUBJECT_PREFIX}.${sourceSubject.slice(2)}`;
    }
    return `${exports.NATS_DLQ_SUBJECT_PREFIX}.${sourceSubject}`;
}
//# sourceMappingURL=nats.constants.js.map