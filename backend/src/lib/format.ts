/** 2026-10-27 -> 27/10/2026 (mensagens que aparecem para a equipe). */
export function dataCurta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
