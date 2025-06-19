#!/bin/bash
# MongoDB Backup Script
# Usage: ./backup-database.sh [restore]

DB_NAME="analytics_prod"
BACKUP_DIR="/var/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONNECTION_STRING="mongodb://Andrei:Andrei123@localhost:27017/TrafficToolsReport?authSource=TrafficToolsReport"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

if [ "$1" == "restore" ]; then
  # Restore from latest backup
  LATEST_BACKUP=$(ls -td $BACKUP_DIR/* | head -1)
  if [ -z "$LATEST_BACKUP" ]; then
    echo "No backups found in $BACKUP_DIR"
    exit 1
  fi
  
  echo "Restoring from $LATEST_BACKUP..."
  mongorestore --uri="$CONNECTION_STRING" --drop --preserveUUID --nsInclude="$DB_NAME.*" $LATEST_BACKUP
  echo "Restore complete"
else
  # Create new backup
  BACKUP_PATH="$BACKUP_DIR/$DB_NAME-$TIMESTAMP"
  echo "Backing up $DB_NAME to $BACKUP_PATH..."
  
  mongodump --uri="$CONNECTION_STRING" \
    --db=$DB_NAME \
    --out=$BACKUP_PATH \
    --gzip
  
  # Keep only last 7 backups
  ls -td $BACKUP_DIR/* | tail -n +8 | xargs rm -rf
  echo "Backup complete. Size: $(du -sh $BACKUP_PATH | cut -f1)"
fi