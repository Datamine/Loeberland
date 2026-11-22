variable "aws_region" {
  type    = string
  default = "us-west-2"
}

variable "name" {
  type    = string
  default = "loeberland"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,29}$", var.name))
    error_message = "Use 3–30 lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "game_domain" {
  description = "Optional hostname with a DNS A record pointing to the Elastic IP. An empty value uses the IP with HTTPS."
  type        = string
  default     = ""
  validation {
    condition     = var.game_domain == "" || can(regex("^[a-zA-Z0-9][a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.game_domain))
    error_message = "Supply a DNS hostname such as game.example.com, without a scheme or path."
  }
}

variable "existing_elastic_ip" {
  description = "Optional public IPv4 address already allocated in this AWS account and region. An empty value allocates a new Elastic IP."
  type        = string
  default     = ""
  validation {
    condition     = var.existing_elastic_ip == "" || can(cidrnetmask("${var.existing_elastic_ip}/32"))
    error_message = "Use an IPv4 address without a CIDR suffix."
  }
}

variable "allowed_origins" {
  type    = list(string)
  default = []
  validation {
    condition     = alltrue([for origin in var.allowed_origins : can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", origin))])
    error_message = "Origins must be HTTPS scheme and host, with an optional port and no path."
  }
}

variable "instance_type" {
  description = "An x86_64 instance type. Load-test the instance against the chosen player limit."
  type        = string
  default     = "c8i.large"
}

variable "ssh_cidr" {
  description = "IPv4 CIDR allowed to connect by SSH. The deploy script defaults to the operator's current public address."
  type        = string
  validation {
    condition     = can(cidrnetmask(var.ssh_cidr)) && try(tonumber(split("/", var.ssh_cidr)[1]) > 0, false)
    error_message = "Supply a restricted IPv4 CIDR, for example 192.0.2.4/32."
  }
}

variable "ssh_public_key" {
  description = "OpenSSH public key. The deploy script stores the matching PEM on the operator machine."
  type        = string
}

variable "max_players" {
  type    = number
  default = 100
  validation {
    condition     = var.max_players >= 1 && var.max_players <= 2000 && floor(var.max_players) == var.max_players
    error_message = "Use a whole number between 1 and 2000."
  }
}
