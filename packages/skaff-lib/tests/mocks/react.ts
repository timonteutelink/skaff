export const useState = <T,>(initial: T): [T, (next: T) => void] => [
  initial,
  () => {},
];

const React = { useState };

export default React;
