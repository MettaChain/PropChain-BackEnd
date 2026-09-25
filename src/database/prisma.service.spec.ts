import { scrubQuery } from './prisma.service';

describe('PrismaService - Query Scrubbing (#1252)', () => {
  describe('scrubQuery unit tests', () => {
    it('returns empty string when input is empty or null', () => {
      expect(scrubQuery('')).toBe('');
      expect(scrubQuery(null as any)).toBe('');
    });

    it('redacts $n parameter placeholders', () => {
      const sql = 'SELECT * FROM "User" WHERE id = $1 AND role = $2 AND tenant_id = $10';
      const scrubbed = scrubQuery(sql);
      expect(scrubbed).toBe('SELECT * FROM "User" WHERE id = ? AND role = ? AND tenant_id = ?');
      expect(scrubbed).not.toMatch(/\$\d+/);
    });

    it('redacts single-quoted literal strings', () => {
      const sql = "SELECT * FROM properties WHERE title = 'Luxury Villa' AND location = 'Downtown'";
      const scrubbed = scrubQuery(sql);
      expect(scrubbed).toBe('SELECT * FROM properties WHERE title = ? AND location = ?');
      expect(scrubbed).not.toContain('Luxury Villa');
      expect(scrubbed).not.toContain('Downtown');
    });

    it('redacts email patterns (quoted and unquoted)', () => {
      const fixtures = [
        "SELECT * FROM users WHERE email = 'alice.smith@propchain.io'",
        'SELECT * FROM users WHERE email = bob-admin@sub.domain.org',
        "UPDATE users SET email = 'john.doe+filter@gmail.com' WHERE id = 1",
      ];

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

      for (const fixture of fixtures) {
        const scrubbed = scrubQuery(fixture);
        expect(scrubbed).not.toMatch(emailRegex);
      }
    });

    it('redacts IPv4 and IPv6 addresses (quoted and unquoted)', () => {
      const fixtures = [
        "SELECT * FROM login_history WHERE ip_address = '192.168.1.100'",
        'SELECT * FROM login_history WHERE ip_address = 10.0.0.1',
        "SELECT * FROM audit_logs WHERE ip = '172.16.254.1'",
        "SELECT * FROM sessions WHERE ip = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'",
      ];

      const ipv4Regex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

      for (const fixture of fixtures) {
        const scrubbed = scrubQuery(fixture);
        expect(scrubbed).not.toMatch(ipv4Regex);
      }
    });

    it('redacts phone number patterns (quoted and unquoted)', () => {
      const fixtures = [
        "SELECT * FROM users WHERE phone = '+1-555-123-4567'",
        'SELECT * FROM users WHERE phone = +15551234567',
        "SELECT * FROM agents WHERE phone = '(555) 234-5678'",
        "SELECT * FROM contacts WHERE phone = '555-867-5309'",
        "SELECT * FROM users WHERE mobile = '+44 20 7946 0958'",
      ];

      const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/;

      for (const fixture of fixtures) {
        const scrubbed = scrubQuery(fixture);
        expect(scrubbed).not.toMatch(phoneRegex);
      }
    });

    it('redacts multiple PII types embedded in a complex query', () => {
      const complexQuery =
        "SELECT u.id, u.email, u.phone FROM users u WHERE u.email = 'customer@example.com' " +
        "AND u.phone = '+1-555-987-6543' AND u.last_login_ip = '10.20.30.40' AND u.status = $1";

      const scrubbed = scrubQuery(complexQuery);

      expect(scrubbed).not.toContain('customer@example.com');
      expect(scrubbed).not.toContain('+1-555-987-6543');
      expect(scrubbed).not.toContain('10.20.30.40');
      expect(scrubbed).not.toContain('$1');
      expect(scrubbed).toBe(
        'SELECT u.id, u.email, u.phone FROM users u WHERE u.email = ? ' +
          'AND u.phone = ? AND u.last_login_ip = ? AND u.status = ?',
      );
    });
  });
});
