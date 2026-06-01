it(
  'detects missing blockchain writes',
  async () => {
    blockchainService.transactionExists =
      jest.fn()
        .mockResolvedValue(false);

    const result =
      await service.reconcile();

    expect(
      result.missingWrites,
    ).toBeGreaterThan(0);
  },
);