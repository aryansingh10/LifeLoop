import { Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUserId } from '../../common/auth.js';
import { AttachmentsService } from './attachments.service.js';
import { MAX_UPLOAD_BYTES } from './image-validation.js';

@Controller('api')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** multipart/form-data with a single "file" field. Returns the attachment id. */
  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(@CurrentUserId() userId: string, @UploadedFile() file: { buffer: Buffer; size: number }) {
    const row = await this.attachments.createFromUpload(userId, file);
    return { attachmentId: row.id, width: row.width, height: row.height };
  }

  /** Streams the sanitized image to its owner only. */
  @Get('attachments/:id/content')
  async content(@CurrentUserId() userId: string, @Param('id', new ParseUUIDPipe()) id: string, @Res() res: Response) {
    const { row, data } = await this.attachments.content(userId, id);
    res.setHeader('Content-Type', row.storedMime);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  }
}
