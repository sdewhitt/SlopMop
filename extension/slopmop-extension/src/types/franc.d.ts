declare module 'franc' {
  export function franc(value?: string, options?: { minLength?: number; only?: string[]; ignore?: string[] }): string;
  export function francAll(value?: string, options?: { minLength?: number; only?: string[]; ignore?: string[] }): Array<[string, number]>;
}
