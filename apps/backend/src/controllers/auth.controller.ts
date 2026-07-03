import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private oAuth2Client: OAuth2Client;

  constructor() {
    this.oAuth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage' // Required for @react-oauth/google's auth-code flow
    );
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() body: { code: string }) {
    try {
      this.logger.log('Exchanging auth code for tokens...');
      const { tokens } = await this.oAuth2Client.getToken(body.code);
      
      // We would normally save tokens.refresh_token to the database here!
      // For now, we will set credentials on the client to fetch user profile
      this.oAuth2Client.setCredentials(tokens);

      const ticket = await this.oAuth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      
      return {
        success: true,
        user: {
          name: payload?.name,
          email: payload?.email,
          picture: payload?.picture
        },
        access_token: tokens.access_token,
        hasOfflineAccess: !!tokens.refresh_token
      };
    } catch (error: any) {
      this.logger.error(`Failed to exchange code: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
