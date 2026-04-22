import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that triggers the Facebook OAuth2 flow.
 *
 * Apply to the login route to redirect the user to Facebook for authentication.
 * Apply to the callback route to handle the redirect back from Facebook.
 */
@Injectable()
export class FacebookAuthGuard extends AuthGuard('facebook') {}

