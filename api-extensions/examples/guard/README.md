# Example: NestJS Guard with a Custom Decorator

`PermissionGuard` implements `CanActivate` and works with the custom
`@RequirePermission()` decorator built on `SetMetadata`.

| Piece              | Role                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `SetMetadata`      | `@RequirePermission(...perms)` attaches required permissions to a route |
| `Reflector`        | `getAllAndOverride` reads metadata from the handler, then the class     |
| `ExecutionContext` | Gives access to the handler, controller class and HTTP request          |
| `CanActivate`      | Returns `true` to allow, throws `401`/`403` to deny                     |

## Usage

```ts
@Controller('properties')
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission('property:read')          // class default
export class PropertiesController {
  @Patch(':id')
  @RequirePermission('property:update')      // overrides class default
  update() {}

  @Delete(':id')
  @RequirePermission('property:delete', 'property:admin') // ALL required
  remove() {}
}
```

Register globally with `{ provide: APP_GUARD, useClass: PermissionGuard }`.

## Files

- `require-permission.decorator.ts` - `@RequirePermission` decorator and metadata key
- `permission.guard.ts` - the guard
- `guard-example.controller.ts` - class-level, method-level and multi-permission usage
- `permission.guard.spec.ts` - tests with a real `Reflector`, a mocked `Reflector`, and a mocked `ExecutionContext`
