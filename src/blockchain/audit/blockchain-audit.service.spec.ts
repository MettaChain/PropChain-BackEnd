it(
  'does not persist invalid records',
  async () => {
    await expect(
      service.create({
        transactionId: '',
      }),
    ).rejects.toThrow();

    expect(
      repository.save,
    ).not.toHaveBeenCalled();
  },
);