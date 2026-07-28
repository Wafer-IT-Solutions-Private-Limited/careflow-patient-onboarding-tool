// @hookform/resolvers v5 does not ship type declarations for subpath exports.
declare module "@hookform/resolvers/zod" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function zodResolver(schema: any, schemaOptions?: any, resolverOptions?: any): any;
}
