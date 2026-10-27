import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message = 'Não encontrado') => new HttpError(404, message);

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
};

/** Respostas de erro nunca levam stack trace nem detalhes internos. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ erro: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ erro: 'Dados inválidos', campos: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })) });
    return;
  }
  // JSON malformado no corpo.
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido' });
    return;
  }
  logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err), path: req.path }, 'Erro não tratado');
  res.status(500).json({ erro: 'Erro interno' });
};
