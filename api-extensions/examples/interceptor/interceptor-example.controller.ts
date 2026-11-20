import { Controller, Get, NotFoundException, Param, UseInterceptors } from '@nestjs/common';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

/**
 * Usage examples for ResponseEnvelopeInterceptor.
 *
 * Scopes:
 *  - Method:     @UseInterceptors(ResponseEnvelopeInterceptor) on a handler
 *  - Controller: @UseInterceptors(ResponseEnvelopeInterceptor) on the class (shown below)
 *  - Global:     app.useGlobalInterceptors(new ResponseEnvelopeInterceptor())
 *                or { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor }
 */
@Controller('examples/interceptor')
@UseInterceptors(ResponseEnvelopeInterceptor)
export class InterceptorExampleController {
  private readonly properties = new Map([['1', { id: '1', name: 'Sunset Villa' }]]);

  // GET /examples/interceptor/properties/1
  // -> { success: true, data: { id: '1', name: 'Sunset Villa' }, meta: { ... } }
  @Get('properties/:id')
  findOne(@Param('id') id: string) {
    const property = this.properties.get(id);
    if (!property) {
      // HttpExceptions pass through the interceptor's catchError unchanged.
      throw new NotFoundException(`Property ${id} not found`);
    }
    return property;
  }

  // GET /examples/interceptor/boom -> 500 with a sanitized message
  @Get('boom')
  boom() {
    throw new Error('database connection lost');
  }
}
