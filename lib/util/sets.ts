

export const difference = <T>(a: Set<T>, b: Set<T>) => {
    return new Set<T>(
        [...a].filter(x => !b.has(x)));
};

export const equal = <T>(a: Set<T>, b: Set<T>) => {
    const diff1 = difference(a, b);
    if (diff1.size > 0) {
        return false
    }
    const diff2 = difference(b, a);
    return diff2.size == 0;
};

