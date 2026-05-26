# Provider Setup Guide

Detailed setup instructions for each LLM provider.

## Anthropic Claude

### Getting an API Key

1. Visit [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy your API key (starts with `sk-ant-api03-`)

### Configuration

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-..."
    }
  }
}
```

Or use environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### Available Models

| Model ID | Name | Context | Best For |
|----------|------|---------|----------|
| `claude-sonnet-4-20250514` | Claude 4 Sonnet | 200K | Balanced performance/cost |
| `claude-opus-4-20250514` | Claude 4 Opus | 200K | Complex reasoning |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet | 200K | Fast, capable |
| `claude-3-5-haiku-20241022` | Claude 3.5 Haiku | 200K | Speed, low cost |

### Pricing (as of 2025)

- **Claude 4 Sonnet**: $3/$15 per MTok (input/output)
- **Claude 4 Opus**: $15/$75 per MTok
- **Claude 3.5 Sonnet**: $3/$15 per MTok
- **Claude 3.5 Haiku**: $0.80/$4 per MTok

### Features

- ✅ Streaming
- ✅ Tool use (function calling)
- ✅ Vision (image inputs)
- ✅ Long context (200K tokens)
- ✅ System prompts

---

## OpenAI

### Getting an API Key

1. Visit [platform.openai.com](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API keys**
4. Click **Create new secret key**
5. Copy your API key (starts with `sk-`)

### Configuration

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "organization": "org-..."
    }
  }
}
```

Or use environment variable:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_ORG_ID="org-..."
```

### Available Models

| Model ID | Name | Context | Best For |
|----------|------|---------|----------|
| `gpt-4-turbo` | GPT-4 Turbo | 128K | Latest GPT-4 |
| `gpt-4` | GPT-4 | 8K | Reliable reasoning |
| `gpt-3.5-turbo` | GPT-3.5 Turbo | 16K | Fast, affordable |
| `gpt-4o` | GPT-4o | 128K | Multimodal |

### Pricing

- **GPT-4 Turbo**: $10/$30 per MTok
- **GPT-4**: $30/$60 per MTok
- **GPT-3.5 Turbo**: $0.50/$1.50 per MTok

### Features

- ✅ Streaming
- ✅ Tool use (function calling)
- ✅ Vision (GPT-4o, GPT-4 Turbo)
- ✅ Long context
- ✅ JSON mode

---

## AWS Bedrock

### Setup

1. Create an AWS account
2. Enable Bedrock in your region (us-east-1, us-west-2, etc.)
3. Request model access in Bedrock console
4. Create IAM user with `bedrock:InvokeModel` permission
5. Generate access keys

### Configuration

```json
{
  "providers": {
    "bedrock": {
      "region": "us-east-1",
      "accessKeyId": "AKIA...",
      "secretAccessKey": "..."
    }
  }
}
```

Or use environment variables:

```bash
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
```

### Available Models

Claude models via Bedrock:

| Model ID | Name |
|----------|------|
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Claude 3.5 Sonnet |
| `anthropic.claude-3-opus-20240229-v1:0` | Claude 3 Opus |
| `anthropic.claude-3-sonnet-20240229-v1:0` | Claude 3 Sonnet |
| `anthropic.claude-3-haiku-20240307-v1:0` | Claude 3 Haiku |

### Pricing

Varies by region. Check AWS Bedrock pricing page.

### Features

- ✅ Streaming
- ✅ Tool use
- ✅ Vision (Claude 3+)
- ✅ AWS integration

---

## Google Gemini

### Getting an API Key

1. Visit [ai.google.dev](https://ai.google.dev/)
2. Click **Get API key**
3. Create a new project or select existing
4. Generate API key

### Configuration

```json
{
  "providers": {
    "gemini": {
      "apiKey": "AIza..."
    }
  }
}
```

Or use environment variable:

```bash
export GOOGLE_API_KEY="AIza..."
```

### Available Models

| Model ID | Name | Context | Best For |
|----------|------|---------|----------|
| `gemini-2.0-flash-exp` | Gemini 2.0 Flash | 1M | Experimental, fast |
| `gemini-1.5-pro` | Gemini 1.5 Pro | 2M | Long context |
| `gemini-1.5-flash` | Gemini 1.5 Flash | 1M | Speed |

### Pricing

- **Gemini 1.5 Pro**: $1.25/$5 per MTok (up to 128K context)
- **Gemini 1.5 Flash**: $0.075/$0.30 per MTok

### Features

- ✅ Streaming
- ✅ Tool use
- ✅ Vision
- ✅ Very long context (up to 2M tokens)
- ✅ Audio/video inputs

---

## Ollama (Local)

### Setup

1. Install Ollama: [ollama.ai](https://ollama.ai/)
2. Pull models: `ollama pull llama3.1`
3. Start Ollama: `ollama serve`

### Configuration

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

### Available Models

Any model from [ollama.ai/library](https://ollama.ai/library):

- `llama3.1` - Meta's Llama 3.1
- `mistral` - Mistral 7B
- `codellama` - Code-specialized Llama
- `phi3` - Microsoft Phi-3
- `qwen2.5` - Alibaba Qwen 2.5

Pull models with:

```bash
ollama pull llama3.1
ollama pull mistral
```

### Pricing

**Free** - runs locally on your hardware.

### Features

- ✅ Streaming
- ✅ Tool use (some models)
- ✅ No API key required
- ✅ Private/offline
- ❌ Limited context vs cloud models

### Hardware Requirements

- **Minimum**: 8GB RAM for 7B models
- **Recommended**: 16GB+ RAM for 13B+ models
- **GPU**: Optional but significantly faster (NVIDIA/AMD/Metal)

---

## OpenRouter

### Getting an API Key

1. Visit [openrouter.ai](https://openrouter.ai/)
2. Sign up
3. Go to **Keys** tab
4. Create API key

### Configuration

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-..."
    }
  }
}
```

Or use environment variable:

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

### Available Models

100+ models from various providers. Popular ones:

- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4-turbo`
- `google/gemini-pro-1.5`
- `meta-llama/llama-3.1-70b-instruct`
- `mistralai/mistral-large`

See full list: [openrouter.ai/models](https://openrouter.ai/models)

### Pricing

Varies by model. Check OpenRouter pricing page.

### Features

- ✅ Access to 100+ models
- ✅ Unified API
- ✅ Fallback routing
- ✅ Streaming
- ✅ Tool use (model-dependent)

---

## Replicate

### Getting an API Key

1. Visit [replicate.com](https://replicate.com/)
2. Sign up
3. Go to **Account settings** → **API tokens**
4. Create token

### Configuration

```json
{
  "providers": {
    "replicate": {
      "apiKey": "r8_..."
    }
  }
}
```

Or use environment variable:

```bash
export REPLICATE_API_TOKEN="r8_..."
```

### Available Models

- `meta/llama-2-70b-chat`
- `mistralai/mistral-7b-instruct-v0.2`
- `meta/codellama-70b-instruct`

See full list: [replicate.com/explore](https://replicate.com/explore)

### Pricing

Pay per prediction. Varies by model.

### Features

- ✅ Access to open-source models
- ✅ GPU inference
- ✅ Custom model deployment
- ❌ Higher latency (cold starts)
- ❌ Limited streaming support

---

## Switching Providers

Change provider at runtime:

```bash
# In REPL
/model gpt-4-turbo
/model claude-opus-4-20250514
/model llama3.1
```

Or via command-line:

```bash
npm start -- --provider openai --model gpt-4-turbo
```

## Multi-Provider Setup

Configure multiple providers and switch between them:

```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": { "apiKey": "..." },
    "openai": { "apiKey": "..." },
    "ollama": { "baseUrl": "http://localhost:11434" }
  }
}
```

Use different providers for different agents:

```bash
/join researcher
/model claude-sonnet-4-20250514

/spawn coder
/model gpt-4-turbo

/spawn local
/model llama3.1
```

## Troubleshooting

### "API key not configured"

Ensure your config file has the API key:

```bash
cat ~/.armament/config.json
```

Or set environment variable:

```bash
echo $ANTHROPIC_API_KEY
```

### "Model not found"

Check model ID is correct for the provider. Use exact IDs from this guide.

### "Rate limit exceeded"

- Wait and retry
- Use a different model
- Check your API usage dashboard
- Consider upgrading your API plan

### "Insufficient quota"

- Add credits to your account
- Check billing settings
- Switch to a different provider

## See Also

- [Configuration Guide](./CONFIGURATION.md) - All configuration options
- [Getting Started](./GETTING_STARTED.md) - Initial setup
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
