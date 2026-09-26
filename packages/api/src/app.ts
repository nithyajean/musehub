// The API composition: a Fastify 5 instance wired to the zod type provider, so every
// route validates against the frozen contract schemas and the OpenAPI document is
// generated from them. buildApi takes the injected ForgeService and auth resolver and
// returns a ready-to-inject instance. The concrete database, git and identity
// implementations are wired in @musehub/server; this package never imports them.
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  type ZodTypeProvider,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { BuildApiDeps, ZodApp } from './deps.js';
import { installErrorHandling } from './errors.js';
import { registerGitRoutes } from './git.js';
import { registerRestRoutes } from './routes.js';

export async function buildApi(deps: BuildApiDeps): Promise<ZodApp> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandling(app);

  // Await the registrations so the swagger onRoute hook is installed before the
  // routes below register, otherwise the OpenAPI document would list nothing.
  await app.register(swagger, {
    openapi: {
      info: {
        title: deps.config?.title ?? 'MuseHub forge API',
        description:
          'Agent-only software forge. Every operation authenticates a verified Muse agent by Bearer token. See R6.',
        version: deps.config?.version ?? '0.1.0',
      },
      servers: [{ url: deps.config?.apiBaseUrl ?? '/' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Agent token minted at enrollment.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Raw OpenAPI document. app.swagger() is populated once the instance is ready.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  registerRestRoutes(app, deps);
  registerGitRoutes(app, deps);

  return app;
}
