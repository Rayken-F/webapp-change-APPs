/* Local stdio bridge to the existing browser's pure OCR routines. No network. */
'use strict';
const readline = require('node:readline');
const H = require('../../DS-CYLINDER-REGISTRATION-DEMO/handwriting-core.js');
const pack = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const floats = b => {
  const buffer = Buffer.from(b, 'base64');
  if (buffer.byteLength % 4) throw Error('FLOAT_DATA');
  return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
};
function handle(request) {
  if (request.type === 'prepare') {
    const raw = H.rgb({width: request.width, height: request.height,
      data: new Uint8ClampedArray(Buffer.from(request.rgb, 'base64'))});
    const ink = H.blueInk(raw);
    return {inkFound: !!ink, views: [raw, ink || H.padded(raw)].map(source => {
      const input = H.tensor(source);
      return {data: pack(input.data), dims: input.dims, resizedWidth: input.resizedWidth};
    })};
  }
  if (request.type === 'decode') {
    if (!['ctn', 'steel'].includes(request.field) || request.outputs.length !== 2) throw Error('REQUEST');
    const decoded = request.outputs.map(out => H.decode({data: floats(out.data), dims: out.dims}, request.characters));
    const choices = decoded.flatMap(d => {
      const constrained = H.constrain(d, request.field);
      return constrained ? [d, constrained] : [d];
    });
    return {aspect_raw: decoded[0], aspect_ink: decoded[1],
      aspect_views: H.choose(decoded.slice(), request.field), aspect_views_rules: H.choose(choices, request.field)};
  }
  throw Error('REQUEST');
}
readline.createInterface({input: process.stdin, crlfDelay: Infinity}).on('line', line => {
  try { process.stdout.write(JSON.stringify({ok: true, result: handle(JSON.parse(line))}) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify({ok: false, error: error.message}) + '\n'); }
});
