output "elastic_ip" {
  value = local.elastic_ip
}

output "game_url" {
  value = "https://${local.game_host}/"
}

output "websocket_url" {
  value = "wss://${local.game_host}/ws"
}

output "backup_bucket" {
  value = aws_s3_bucket.game.id
}

output "release_sha256" {
  value = trimsuffix(trimprefix(aws_s3_object.release.key, "releases/"), ".tar.gz")
}

output "instance_id" {
  value = aws_instance.game.id
}

output "connect" {
  value = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.game.id}"
}

output "compose_environment" {
  description = "Non-secret configuration sent to the host by the deploy script."
  value       = local.compose_environment
}
