async requestEscalation(
  userId: string,
  dto: RequestRoleEscalationDto,
) {
  const request =
    this.repository.create({
      userId,
      currentRole: user.role,
      requestedRole:
        dto.requestedRole,
    });

  const saved =
    await this.repository.save(
      request,
    );

  await this.auditService.log({
    action:
      'ROLE_ESCALATION_REQUESTED',
    userId,
    resourceId: saved.id,
    metadata: {
      currentRole:
        user.role,
      requestedRole:
        dto.requestedRole,
    },
  });

  return saved;
}