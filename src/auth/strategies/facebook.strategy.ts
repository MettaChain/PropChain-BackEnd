import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';
import { AuthService } from '../auth.service';

/**
 * Facebook OAuth2 strategy for Passport.
 *
 * Reads FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_CALLBACK_URL
 * from environment variables. Configure these in your .env file:
 *
 * FACEBOOK_APP_ID=your_app_id
 * FACEBOOK_APP_SECRET=your_app_secret
 * FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback
 */
@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.FACEBOOK_APP_ID ?? '',
      clientSecret: process.env.FACEBOOK_APP_SECRET ?? '',
      callbackURL: process.env.FACEBOOK_CALLBACK_URL ?? '',
      profileFields: ['id', 'emails', 'name', 'picture'],
      scope: ['email'],
    });
  }

  /**
   * Called after Facebook redirects back with a valid token.
   * Links or creates a user account based on the Facebook profile.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<void> {
    try {
      const user = await this.authService.validateFacebookUser({
        facebookId: profile.id,
        email: profile.emails?.[0]?.value,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatar: profile.photos?.[0]?.value,
      });
      done(null, user);
    } catch (error) {
      done(error, undefined);
    }
  }
}

