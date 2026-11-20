declare module '*/_handler.cjs' {
  const handler: typeof import('./vercel-api-entry').default;
  export default handler;
}
