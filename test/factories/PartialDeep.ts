/*
    Allow for "Partials of Partials". This allows you to do a nested partial and
    only provide a subset of the values. 

    So if your type is:
    type Foo {
        bar: {
            cat: string,
            dog: string
        },
        frog: number
    }
    A PartialDeep<Foo> could be:
    {
        bar: {
            cat: 'Meow'
        }
    }
    Pulled from https://stackblitz.com/edit/typescript-49xodt?file=index.ts
*/
export type PartialDeep<K> = {
  [attr in keyof K]?: K[attr] extends object ? PartialDeep<K[attr]> : K[attr]
}
