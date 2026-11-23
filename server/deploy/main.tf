terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = var.name }
  }
}

resource "aws_vpc" "game" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

data "aws_ec2_instance_type_offerings" "game" {
  location_type = "availability-zone"
  filter {
    name   = "instance-type"
    values = [var.instance_type]
  }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.game.id
  cidr_block        = "10.42.1.0/24"
  availability_zone = sort(data.aws_ec2_instance_type_offerings.game.locations)[0]
  tags              = { Name = "${var.name}-public" }
  lifecycle {
    ignore_changes = [availability_zone]
  }
}

resource "aws_internet_gateway" "game" {
  vpc_id = aws_vpc.game.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.game.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.game.id
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
}

resource "aws_s3_bucket" "game" {
  bucket_prefix = "${var.name}-"
  # Keep backups on accidental terraform destroy; empty the bucket explicitly.
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "game" {
  bucket                  = aws_s3_bucket.game.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "game" {
  bucket = aws_s3_bucket.game.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "game" {
  bucket = aws_s3_bucket.game.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "game" {
  bucket     = aws_s3_bucket.game.id
  depends_on = [aws_s3_bucket_versioning.game]
  rule {
    id     = "expire-backups"
    status = "Enabled"
    filter {
      prefix = "backups/"
    }
    expiration {
      days = 1
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
  rule {
    id     = "expire-old-releases"
    status = "Enabled"
    filter {
      prefix = "releases/"
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_object" "release" {
  bucket      = aws_s3_bucket.game.id
  key         = "releases/${filesha256("${path.module}/game.tar.gz")}.tar.gz"
  source      = "${path.module}/game.tar.gz"
  source_hash = filemd5("${path.module}/game.tar.gz")
  depends_on  = [aws_s3_bucket_versioning.game]
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_iam_role" "game" {
  name_prefix = "${var.name}-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "ec2.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.game.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "storage" {
  role = aws_iam_role.game.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${aws_s3_bucket.game.arn}/releases/*", "${aws_s3_bucket.game.arn}/backups/*"] },
      { Effect = "Allow", Action = ["s3:PutObject"], Resource = "${aws_s3_bucket.game.arn}/backups/*" },
      { Effect = "Allow", Action = ["s3:DeleteObjectVersion"], Resource = "${aws_s3_bucket.game.arn}/backups/world-*.sqlite" },
      {
        Effect    = "Allow"
        Action    = ["s3:ListBucketVersions"]
        Resource  = aws_s3_bucket.game.arn
        Condition = { StringEquals = { "s3:prefix" = "backups/world-" } }
      }
    ]
  })
}

resource "aws_iam_instance_profile" "game" {
  name_prefix = "${var.name}-"
  role        = aws_iam_role.game.name
}

resource "aws_security_group" "game" {
  name_prefix = "${var.name}-"
  description = "Public HTTPS game and restricted SSH"
  vpc_id      = aws_vpc.game.id
  ingress {
    description = "HTTP and ACME"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "HTTPS and WebSockets"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    description = "SSH from the operator network"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_key_pair" "game" {
  count           = var.ssh_key_name == "" ? 1 : 0
  key_name_prefix = "${var.name}-"
  public_key      = trimspace(var.ssh_public_key)

  lifecycle {
    precondition {
      condition     = trimspace(var.ssh_public_key) != ""
      error_message = "Supply an existing EC2 key pair name or an OpenSSH public key."
    }
  }
}

moved {
  from = aws_key_pair.game
  to   = aws_key_pair.game[0]
}

locals {
  elastic_ip = var.existing_elastic_ip == "" ? aws_eip.game[0].public_ip : data.aws_eip.reserved[0].public_ip
  allocation = var.existing_elastic_ip == "" ? aws_eip.game[0].id : data.aws_eip.reserved[0].id
  game_host  = var.game_domain == "" ? local.elastic_ip : lower(var.game_domain)
  compose_environment = join("\n", [
    "COMPOSE_PROJECT_NAME=${var.name}",
    "GAME_DOMAIN=${local.game_host}",
    "CADDY_CONFIG=${var.game_domain == "" ? "Caddyfile.ip" : "Caddyfile"}",
    "ALLOWED_ORIGINS=${join(",", distinct(concat(var.allowed_origins, ["https://${local.game_host}"])))}",
    "MAX_PLAYERS=${var.max_players}",
    "PREBUILT_CLIENT=1",
    "ADMIN_ENV_FILE=/etc/loeberland/admin.env",
    "ADMIN_QUEUE_EDITS=1",
    "BACKUP_DIR=/var/lib/loeberland/backups",
    "",
  ])
}

resource "aws_instance" "game" {
  ami                         = data.aws_ssm_parameter.ubuntu.value
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.public.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.game.id]
  iam_instance_profile        = aws_iam_instance_profile.game.name
  key_name                    = var.ssh_key_name == "" ? aws_key_pair.game[0].key_name : var.ssh_key_name
  root_block_device {
    volume_type = "gp3"
    volume_size = 40
    encrypted   = true
  }
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    bucket = aws_s3_bucket.game.id
    region = var.aws_region
  })
  # Releases are installed explicitly on the existing host, preserving its RAM
  # world and Docker volumes. Bootstrap and AMI upgrades need planned replacement.
  lifecycle {
    ignore_changes = [ami, user_data]
  }
  depends_on = [aws_route_table_association.public, aws_iam_role_policy.storage, aws_iam_role_policy_attachment.ssm]
  tags       = { Name = var.name }
}

resource "aws_eip" "game" {
  count  = var.existing_elastic_ip == "" ? 1 : 0
  domain = "vpc"
}

data "aws_eip" "reserved" {
  count     = var.existing_elastic_ip == "" ? 0 : 1
  public_ip = var.existing_elastic_ip
}

moved {
  from = aws_eip.game
  to   = aws_eip.game[0]
}

resource "aws_eip_association" "game" {
  allocation_id       = local.allocation
  instance_id         = aws_instance.game.id
  allow_reassociation = false
}
