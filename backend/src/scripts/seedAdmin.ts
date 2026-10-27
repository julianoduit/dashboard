import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import * as users from '../db/repositories/users.js';
import { runCli } from './cli.js';

// Cria o primeiro admin. A senha é pedida no terminal (não fica no histórico do shell).
//   npm run seed:admin -- --email=voce@duit.com.br --nome="Seu Nome"
// Em automação, a senha pode vir de SEED_ADMIN_PASSWORD.
const { values } = parseArgs({ options: { email: { type: 'string' }, nome: { type: 'string' } } });

async function askPassword(): Promise<string> {
  if (process.env.SEED_ADMIN_PASSWORD) return process.env.SEED_ADMIN_PASSWORD;
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  // Esconde o que é digitado.
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let prompting = true;
  out._writeToOutput = (s: string) => {
    if (!prompting || s.includes('Senha')) stdout.write(s);
  };
  const senha = await rl.question('Senha (mínimo 8 caracteres): ');
  prompting = false;
  stdout.write('\n');
  rl.close();
  return senha;
}

await runCli(async () => {
  const email = z.string().trim().toLowerCase().email().parse(values.email);
  const nome = z.string().trim().min(1).parse(values.nome);
  if (await users.findByEmailWithHash(email)) throw new Error(`Já existe um usuário com o e-mail ${email}`);
  const senha = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').parse(await askPassword());
  const user = await users.create({ nome, email, senhaHash: await hashPassword(senha), papel: 'admin' });
  console.log(`Admin criado: ${user.nome} <${user.email}> (id ${user.id})`);
});
