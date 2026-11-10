interface WikiNodeResult {
  node: { obj_token: string; obj_type: string };
}

/** Extract tokens locally. Only Wiki resolution makes an API request. */
export async function resolveTableToken(
  reference: string,
  type: 'sheet' | 'bitable',
  getWikiNode: (token: string) => Promise<WikiNodeResult>,
): Promise<string> {
  if (/^[A-Za-z0-9_-]+$/.test(reference)) return reference;

  const url = new URL(reference);
  const [, kind, token] = url.pathname.split('/');
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('Provide a spreadsheet/Base token or a /sheets/, /base/, or /wiki/ URL.');
  }
  if (kind === 'wiki') {
    const { node } = await getWikiNode(token);
    if (node.obj_type !== type)
      throw new Error(`Expected ${type}, but the Wiki node contains ${node.obj_type}.`);
    return node.obj_token;
  }
  const expectedKind = type === 'sheet' ? 'sheets' : 'base';
  if (kind !== expectedKind) throw new Error(`Expected a /${expectedKind}/ URL.`);
  return token;
}
