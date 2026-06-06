import { Command } from 'commander';
import { createArchiver } from '../execution/archiver.js';
import type { InfrastructureContext } from '../infrastructure/context.js';
import { VectaHubError, ErrorType } from '../infrastructure/errors/index.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createArchiveCmd(context: InfrastructureContext): Command {
  const logger = context.logger.getLogger('archive');
  return new Command('archive')
    .description('Archive old execution records')
    .option('-b, --before <date>', 'Archive records before this ISO date')
    .option('-l, --list', 'List existing archives')
    .option('-r, --restore <archiveId>', 'Restore an archive')
    .option('-d, --delete <archiveId>', 'Delete an archive')
    .action(async (options: { before?: string; list?: boolean; restore?: string; delete?: string }) => {
      const archiver = createArchiver();

      if (options.list) {
        const archives = await archiver.listArchives();
        if (archives.length === 0) {
          logger.info('No archives found.');
          return;
        }

        logger.info('');
        logger.info('Archives:');
        logger.info('-'.repeat(60));
        for (const a of archives) {
          logger.info(`  ${a.archiveId} | Created: ${a.createdAt.slice(0, 19)} | Size: ${formatSize(a.compressedSize)}`);
        }
        logger.info('');
        return;
      }

      if (options.restore) {
        logger.info(`Restoring archive ${options.restore}...`);
        await archiver.restore(options.restore);
        logger.info('Archive restored.');
        return;
      }

      if (options.delete) {
        logger.info(`Deleting archive ${options.delete}...`);
        await archiver.deleteArchive(options.delete);
        logger.info('Archive deleted.');
        return;
      }

      if (options.before) {
        const cutoffDate = new Date(options.before);
        if (isNaN(cutoffDate.getTime())) {
          throw new VectaHubError(`Invalid date: ${options.before}`, ErrorType.RUNTIME);
        }

        logger.info(`\nArchiving records before ${options.before}...`);
        const result = await archiver.archiveBefore(cutoffDate);

        if (result.archivedCount === 0) {
          logger.info('No records to archive.');
          return;
        }

        logger.info(`Archive created: ${result.archiveId}`);
        logger.info(`Records archived: ${result.archivedCount}`);
        logger.info(`Original size: ${formatSize(result.originalSize)}`);
        logger.info(`Compressed size: ${formatSize(result.compressedSize)}`);
        logger.info(`Compression ratio: ${(result.compressionRatio * 100).toFixed(1)}%`);
        logger.info('');
        return;
      }

      logger.info('Usage:');
      logger.info('  vectahub archive --before 2026-01-01   # Archive old records');
      logger.info('  vectahub archive --list                 # List archives');
      logger.info('  vectahub archive --restore archive_123  # Restore an archive');
      logger.info('  vectahub archive --delete archive_123   # Delete an archive');
    });
}
