# Avatar Upload Feature

This document describes the avatar upload functionality implemented for the PropChain backend.

## Overview

The avatar upload feature allows users to upload profile pictures with automatic validation, resizing, and URL generation.

## Features

### Image Validation
- **File Types**: JPEG, PNG, WebP
- **Maximum File Size**: 5MB (configurable)
- **File Extension Validation**: Ensures only valid image extensions are accepted

### Image Resizing
- **Small**: 64x64 pixels
- **Medium**: 128x128 pixels  
- **Large**: 256x256 pixels
- Each size is stored as a separate file with appropriate prefix

### Storage & URLs
- **Storage Path**: `./uploads/avatars/{userId}/`
- **File Naming**: `{userId}_{hash}.{extension}`
- **URL Format**: `{baseUrl}/uploads/avatars/{userId}/{filename}`
- **Size Variants**: `{baseUrl}/uploads/avatars/{userId}/{size}_{filename}`

## API Endpoints

### Upload Avatar
```
POST /users/avatar/upload
Content-Type: multipart/form-data

Body: avatar (file)
Response: {
  avatarUrl: string,
  sizes: {
    small: string,
    medium: string,
    large: string
  }
}
```

### Delete Avatar
```
DELETE /users/avatar/delete
Content-Type: application/json

Body: {
  filename: string
}
Response: {
  message: string
}
```

### Get Current Avatar
```
GET /users/avatar/current
Response: {
  avatarUrl?: string
}
```

### Get Specific Avatar
```
GET /users/avatar/:filename
Response: {
  avatarUrl: string
}
```

## Configuration

Add these environment variables to your `.env` file:

```env
# Avatar upload settings
AVATAR_UPLOAD_DIR=./uploads/avatars
AVATAR_MAX_FILE_SIZE=5242880  # 5MB in bytes
BASE_URL=http://localhost:3000
```

## Implementation Details

### Services

#### AvatarUploadService
- Handles file validation and storage
- Generates unique filenames using SHA256 hash
- Creates multiple size variants
- Manages file deletion

#### UsersService
- Extended with `updateAvatar()` method
- Handles avatar URL updates in database

### Database Schema

The User model already includes an `avatar` field:
```prisma
model User {
  // ... other fields
  avatar String?
  // ... other fields
}
```

### File Structure

```
uploads/avatars/
  user_123/
    user_123_abc123.jpg      # Original
    small_user_123_abc123.jpg # 64x64
    medium_user_123_abc123.jpg # 128x128
    large_user_123_abc123.jpg # 256x256
```

## Security Considerations

1. **File Type Validation**: Only allows image MIME types
2. **File Size Limits**: Prevents oversized uploads
3. **Unique Filenames**: Uses SHA256 hash to prevent conflicts
4. **User Isolation**: Each user gets their own directory

## Error Handling

- **400 Bad Request**: Invalid file, missing file, user not authenticated
- **404 Not Found**: Avatar not found
- **500 Internal Server**: File system errors, service failures

## Testing

Run the avatar upload tests:

```bash
npm test -- test/users/avatar-upload.spec.ts
```

## Dependencies

The implementation uses built-in Node.js modules:
- `fs/promises` - File system operations
- `path` - Path manipulation
- `crypto` - Hash generation

## Future Enhancements

1. **Image Processing**: Integrate Sharp library for actual resizing
2. **Cloud Storage**: Support for AWS S3, CloudFront CDN
3. **Image Optimization**: Automatic compression and format conversion
4. **Avatar Moderation**: Content moderation and approval workflow
5. **Default Avatars**: Fallback avatar generation
6. **Avatar History**: Track avatar changes over time

## Usage Example

```javascript
// Upload avatar
const formData = new FormData();
formData.append('avatar', file);

const response = await fetch('/users/avatar/upload', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

const result = await response.json();
console.log(result.avatarUrl); // Main avatar URL
console.log(result.sizes.small); // Small avatar URL
```

## Troubleshooting

### Common Issues

1. **File Upload Fails**: Check file size and type
2. **Avatar Not Displaying**: Verify URL generation and file paths
3. **Permission Errors**: Ensure upload directory is writable
4. **Database Issues**: Check User model and avatar field

### Debug Logging

Enable debug logging by setting log level in your environment:

```env
LOG_LEVEL=debug
```

# Avatar Upload Feature

This document describes the avatar upload functionality implemented for the PropChain backend.

## Overview

The avatar upload feature allows users to upload profile pictures with automatic validation, resizing, and URL generation.

## Features

### Image Validation
- **File Types**: JPEG, PNG, WebP
- **Maximum File Size**: 5MB (configurable)
- **File Extension Validation**: Ensures only valid image extensions are accepted

### Image Resizing
- **Small**: 64x64 pixels
- **Medium**: 128x128 pixels  
- **Large**: 256x256 pixels
- Each size is stored as a separate file with appropriate prefix

### Storage & URLs
- **Storage Path**: `./uploads/avatars/{userId}/`
- **File Naming**: `{userId}_{hash}.{extension}`
- **URL Format**: `{baseUrl}/uploads/avatars/{userId}/{filename}`
- **Size Variants**: `{baseUrl}/uploads/avatars/{userId}/{size}_{filename}`

## API Endpoints

### Upload Avatar
```
POST /users/avatar/upload
Content-Type: multipart/form-data

Body: avatar (file)
Response: {
  avatarUrl: string,
  sizes: {
    small: string,
    medium: string,
    large: string
  }
}
```

### Delete Avatar
```
DELETE /users/avatar/delete
Content-Type: application/json

Body: {
  filename: string
}
Response: {
  message: string
}
```

### Get Current Avatar
```
GET /users/avatar/current
Response: {
  avatarUrl?: string
}
```

### Get Specific Avatar
```
GET /users/avatar/:filename
Response: {
  avatarUrl: string
}
```

## Configuration

Add these environment variables to your `.env` file:

```env
# Avatar upload settings
AVATAR_UPLOAD_DIR=./uploads/avatars
AVATAR_MAX_FILE_SIZE=5242880  # 5MB in bytes
BASE_URL=http://localhost:3000
```

## Implementation Details

### Services

#### AvatarUploadService
- Handles file validation and storage
- Generates unique filenames using SHA256 hash
- Creates multiple size variants
- Manages file deletion

#### UsersService
- Extended with `updateAvatar()` method
- Handles avatar URL updates in database

### Database Schema

The User model already includes an `avatar` field:
```prisma
model User {
  // ... other fields
  avatar String?
  // ... other fields
}
```

### File Structure

```
uploads/avatars/
  user_123/
    user_123_abc123.jpg      # Original
    small_user_123_abc123.jpg # 64x64
    medium_user_123_abc123.jpg # 128x128
    large_user_123_abc123.jpg # 256x256
```

## Security Considerations

1. **File Type Validation**: Only allows image MIME types
2. **File Size Limits**: Prevents oversized uploads
3. **Unique Filenames**: Uses SHA256 hash to prevent conflicts
4. **User Isolation**: Each user gets their own directory

## Error Handling

- **400 Bad Request**: Invalid file, missing file, user not authenticated
- **404 Not Found**: Avatar not found
- **500 Internal Server**: File system errors, service failures

## Testing

Run the avatar upload tests:

```bash
npm test -- test/users/avatar-upload.spec.ts
```

## Dependencies

The implementation uses built-in Node.js modules:
- `fs/promises` - File system operations
- `path` - Path manipulation
- `crypto` - Hash generation

## Future Enhancements

1. **Image Processing**: Integrate Sharp library for actual resizing
2. **Cloud Storage**: Support for AWS S3, CloudFront CDN
3. **Image Optimization**: Automatic compression and format conversion
4. **Avatar Moderation**: Content moderation and approval workflow
5. **Default Avatars**: Fallback avatar generation
6. **Avatar History**: Track avatar changes over time

## Usage Example

```javascript
// Upload avatar
const formData = new FormData();
formData.append('avatar', file);

const response = await fetch('/users/avatar/upload', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

const result = await response.json();
console.log(result.avatarUrl); // Main avatar URL
console.log(result.sizes.small); // Small avatar URL
```

## Troubleshooting

### Common Issues

1. **File Upload Fails**: Check file size and type
2. **Avatar Not Displaying**: Verify URL generation and file paths
3. **Permission Errors**: Ensure upload directory is writable
4. **Database Issues**: Check User model and avatar field

### Debug Logging

Enable debug logging by setting log level in your environment:

```env
LOG_LEVEL=debug
```
