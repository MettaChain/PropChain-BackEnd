describe(
  'AdminAccessLoggingInterceptor',
  () => {
    it(
      'logs dashboard access',
      async () => {
        const auditService = {
          log: jest.fn(),
        };

        // execute interceptor

        expect(
          auditService.log,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            action:
              'ADMIN_DASHBOARD_ACCESS',
          }),
        );
      },
    );
  },
);