CREATE TABLE IF NOT EXISTS barcode_aliases (
  id int AUTO_INCREMENT PRIMARY KEY,
  barcode varchar(200) NOT NULL UNIQUE,
  productId int NULL,
  variantId int NULL,
  batchId int NULL,
  storeId int NULL,
  aliasType enum('manufacturer','internal','batch','shelf','legacy') NOT NULL DEFAULT 'internal',
  isActive boolean NOT NULL DEFAULT true,
  metadata text NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS label_print_jobs (
  id int AUTO_INCREMENT PRIMARY KEY,
  barcodeAliasId int NULL,
  productId int NULL,
  variantId int NULL,
  batchId int NULL,
  storeId int NULL,
  labelType enum('batch','shelf','mrp','return','audit') NOT NULL DEFAULT 'batch',
  payloadJson text NOT NULL,
  status enum('queued','printed','failed','cancelled') NOT NULL DEFAULT 'queued',
  printerName varchar(120) NULL,
  requestedBy int NULL,
  printedAt timestamp NULL,
  error text NULL,
  createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
