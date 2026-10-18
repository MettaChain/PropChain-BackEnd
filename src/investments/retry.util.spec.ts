import { retryWithBackoff } from './retry.util';

describe('retryWithBackoff', () => {
  it('retries until the operation succeeds', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');
    await expect(retryWithBackoff(fn, 2, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(retryWithBackoff(fn, 2, 1)).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
