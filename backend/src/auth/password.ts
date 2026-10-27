import bcrypt from 'bcryptjs';

const COST = 12;
// Hash fixo usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos
// e não revelar quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync('senha-que-nao-existe', COST);

export const hashPassword = (senha: string) => bcrypt.hash(senha, COST);

/** Hash que não é bcrypt (ex.: usuário de serviço, sem senha) nunca confere. */
const isBcrypt = (h: string | undefined): h is string => !!h && /^\$2[aby]\$\d{2}\$/.test(h);

export async function verifyPassword(senha: string, hash: string | undefined): Promise<boolean> {
  const valido = isBcrypt(hash);
  const ok = await bcrypt.compare(senha, valido ? hash : DUMMY_HASH);
  return ok && valido;
}
