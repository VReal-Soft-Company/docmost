import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { TransformHttpResponseInterceptor } from './common/interceptors/http-response.interceptor';
import fastifyMultipart from '@fastify/multipart';
import { WsRedisIoAdapter } from './ws/adapter/ws-redis.adapter';
import { InternalLogFilter } from './common/logger/internal-log-filter';
import fastifyCookie from '@fastify/cookie';
import * as nodemailer from 'nodemailer';

async function bootstrap() {

  try {
    console.log('host', process.env.SMTP_HOST);
    console.log('port', Number(process.env.SMTP_PORT));
    console.log('secure', process.env.SMTP_SECURE === 'true');
    console.log('auth.user', process.env.SMTP_USERNAME);
    console.log('auth.pass', process.env.SMTP_PASSWORD);
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USERNAME,
        pass: process.env.SMTP_PASSWORD,
      },
      debug: true,
      logger: true,
    });

    const info = await transporter.sendMail({
      from: '"VReal Soft 👻" <developer@vrealsoft.com>', // sender address
      to: 'igormostovenko@gmail.com', // list of receivers
      subject: 'Hello ✔', // Subject line
      text: 'Hello world?', // plain text body
      html: '<b>Hello world?</b>', // html body
    });

    console.log('Message sent', info);
  } catch (e) {
    console.error(e);
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true,
      maxParamLength: 500,
    }),
    {
      logger: new InternalLogFilter(),
    },
  );

  app.setGlobalPrefix('api');

  const redisIoAdapter = new WsRedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.register(fastifyMultipart as any);
  await app.register(fastifyCookie as any);

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('preHandler', function (req, reply, done) {
      if (
        req.originalUrl.startsWith('/api') &&
        !req.originalUrl.startsWith('/api/auth/setup') &&
        !req.originalUrl.startsWith('/api/health')
      ) {
        if (!req.raw?.['workspaceId']) {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  app.enableCors();

  app.useGlobalInterceptors(new TransformHttpResponseInterceptor());
  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 3000, '0.0.0.0');
}

bootstrap();
