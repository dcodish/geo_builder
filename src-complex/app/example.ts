/**
 * The example button's session. #1367: the given numbers are the `w` family and the unknown is `z`,
 * because the solutions of `z^5 = …` ARE z₁..z₅ (operator ruling). The old example stated z₁, z₂ first
 * and then solved for z — under that ruling it is refused, which is the tool's own example refusing itself.
 */
export const EXAMPLE_LINES = ['w1 = 3+4i', 'w2 = 2cis150', 'w = w1*w2', 'z^5 = w^2'];
