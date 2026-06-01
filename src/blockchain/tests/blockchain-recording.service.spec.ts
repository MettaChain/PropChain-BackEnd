it(
  'queues transaction with retry configuration',
  async () => {
    await service.recordTransaction(
      'tx-1',
    );

    expect(
      queue.add,
    ).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        attempts: 5,
      }),
    );
  },
);
it(
  'logs transaction failures',
  async () => {
    jest
      .spyOn(logger, 'error')
      .mockImplementation();

    await expect(
      service.submitTransaction(
        'tx-1',
      ),
    ).rejects.toThrow();

    expect(
      logger.error,
    ).toHaveBeenCalled();
  },
);