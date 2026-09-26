// One error handler for the whole API. A ForgeError becomes its wire envelope with
// the catalog HTTP status. A schema validation failure (from the zod validator
// compiler) becomes a validation_failed envelope naming the field. Anything else is
// mapped to a client (422) or internal (500) envelope so no raw stack trace leaks.
import { ForgeError, isForgeError } from '@musehub/contracts';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ZodApp } from './deps.js';

export function installErrorHandling(app: ZodApp): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((v) => ({ path: v.instancePath, message: v.message }));
      const first = issues[0];
      const message = first
        ? `Request failed validation: ${first.message} at ${first.path || '(root)'}.`
        : 'Request failed schema validation.';
      const env = new ForgeError('validation_failed', message, {
        next: 'Fix the field named in details and retry.',
        details: { issues },
      }).toEnvelope();
      reply.code(422).send(env);
      return;
    }

    if (isForgeError(error)) {
      reply.code(error.httpStatus).send(error.toEnvelope());
      return;
    }

    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500) {
      // Malformed JSON, unsupported content type and the like: a client error the
      // caller can fix. Map to the same validation envelope.
      const env = new ForgeError('validation_failed', error.message || 'Bad request.', {
        next: 'Check the request body, headers and content type, then retry.',
      }).toEnvelope();
      reply.code(422).send(env);
      return;
    }

    request.log.error({ err: error }, 'unhandled error');
    const env = new ForgeError('internal_error', 'Unexpected server error.', {
      details: { request_id: request.id },
    }).toEnvelope();
    reply.code(500).send(env);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.code(404).send({
      error: {
        message: `No route for ${request.method} ${request.url}.`,
        http_status: 404,
        retryable: false,
      },
    });
  });
}
