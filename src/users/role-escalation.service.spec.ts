it(
  'creates role escalation request',
  async () => {
    const request =
      await service.requestEscalation(
        user.id,
        dto,
      );

    expect(
      request.status,
    ).toBe('pending');

    expect(
      auditService.log,
    ).toHaveBeenCalled();
  },
);