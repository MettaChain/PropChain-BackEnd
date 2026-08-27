import { requestIdMiddleware } from '../requestId';
import type { Request, Response } from 'express';

describe('requestIdMiddleware', () => {
  it('generates a request id when none is provided', () => {
    const req = { headers: {} } as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('reuses an incoming x-request-id header', () => {
    const req = { headers: { 'x-request-id': 'existing-id' } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe('existing-id');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-id');
  });

  it('handles an array-valued header by using the first value', () => {
    const req = { headers: { 'x-request-id': ['first-id', 'second-id'] } } as unknown as Request;
    const res = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBe('first-id');
  });
});