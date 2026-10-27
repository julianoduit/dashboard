import bcrypt from 'bcryptjs';

const COST = 12;
// Hash fixo usado quando o e-mail não existe, para o login levar o mesmo tempo nos dois casos
// e não revelar quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync('senha-que-nao-existe', COST);

export const hashPassword = (senha: string) => bcrypt.hash(senha, COST);

export async function verifyPassword(senha: string, hash: string | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(senha, hash ?? DUMMY_HASH);
  return ok && hash !== undefined;
}
