import { describe, it, expect } from 'vitest';
import { splitName } from './name-utils';

describe('splitName', () => {
  it('splits "Juan Pérez" into firstName="Juan", lastName="Pérez"', () => {
    expect(splitName('Juan Pérez')).toEqual({
      firstName: 'Juan',
      lastName: 'Pérez',
    });
  });

  it('handles single-word names: "Madonna" → firstName="Madonna", lastName=""', () => {
    expect(splitName('Madonna')).toEqual({
      firstName: 'Madonna',
      lastName: '',
    });
  });

  it('splits on first space only: "Juan Carlos Pérez" → firstName="Juan", lastName="Carlos Pérez"', () => {
    expect(splitName('Juan Carlos Pérez')).toEqual({
      firstName: 'Juan',
      lastName: 'Carlos Pérez',
    });
  });

  it('handles empty string: "" → firstName="", lastName=""', () => {
    expect(splitName('')).toEqual({
      firstName: '',
      lastName: '',
    });
  });

  it('trims leading/trailing whitespace: "  Juan  Pérez  " → firstName="Juan", lastName="Pérez"', () => {
    expect(splitName('  Juan  Pérez  ')).toEqual({
      firstName: 'Juan',
      lastName: 'Pérez',
    });
  });

  it('handles whitespace-only input as empty', () => {
    expect(splitName('   ')).toEqual({
      firstName: '',
      lastName: '',
    });
  });

  it('handles name with multiple spaces in lastName', () => {
    expect(splitName('María de los Ángeles')).toEqual({
      firstName: 'María',
      lastName: 'de los Ángeles',
    });
  });
});
