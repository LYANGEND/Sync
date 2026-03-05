// ============================================================
// Sync School Management System - Azure Infrastructure
// Deploys: Container Apps + PostgreSQL Flexible Server + ACR
// ============================================================

targetScope = 'resourceGroup'

// ── Parameters ──────────────────────────────────────────────
@description('Base name for all resources')
param appName string = 'sync'

@description('Azure region')
param location string = resourceGroup().location

@description('Environment (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('PostgreSQL admin username')
param dbAdminUser string = 'syncadmin'

@secure()
@description('PostgreSQL admin password')
param dbAdminPassword string

@secure()
@description('JWT secret for authentication')
param jwtSecret string

@secure()
@description('Azure OpenAI API key')
param azureOpenAIKey string = ''

@description('Azure OpenAI endpoint URL')
param azureOpenAIEndpoint string = ''

@description('Azure OpenAI deployment name')
param azureOpenAIDeployment string = ''

@secure()
@description('Gemini API key')
param geminiApiKey string = ''

@secure()
@description('VAPID public key for push notifications')
param vapidPublicKey string = ''

@secure()
@description('VAPID private key for push notifications')
param vapidPrivateKey string = ''

@description('VAPID contact email')
param vapidEmail string = ''

@description('Backend container image')
param backendImage string = ''

@description('Frontend container image')
param frontendImage string = ''

// ── Variables ───────────────────────────────────────────────
var prefix = '${appName}-${environment}'
var tags = {
  app: appName
  environment: environment
  managedBy: 'bicep'
}

// ── Container Registry ──────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: replace('${prefix}acr', '-', '')
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ── Log Analytics Workspace ─────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ── Container Apps Environment ──────────────────────────────
resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${prefix}-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

// ── PostgreSQL Flexible Server ──────────────────────────────
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${prefix}-db'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: dbAdminUser
    administratorLoginPassword: dbAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

// PostgreSQL database
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: 'sync_db'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allow Azure services to connect
resource pgFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-06-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ── Backend Container App ───────────────────────────────────
var dbConnectionString = 'postgresql://${dbAdminUser}:${dbAdminPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/sync_db?schema=public&sslmode=require'

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-backend'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 4000
        transport: 'http'
        allowInsecure: true
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'database-url'
          value: dbConnectionString
        }
        {
          name: 'jwt-secret'
          value: jwtSecret
        }
        {
          name: 'azure-openai-key'
          value: !empty(azureOpenAIKey) ? azureOpenAIKey : 'not-set'
        }
        {
          name: 'gemini-api-key'
          value: !empty(geminiApiKey) ? geminiApiKey : 'not-set'
        }
        {
          name: 'vapid-public-key'
          value: !empty(vapidPublicKey) ? vapidPublicKey : 'not-set'
        }
        {
          name: 'vapid-private-key'
          value: !empty(vapidPrivateKey) ? vapidPrivateKey : 'not-set'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: !empty(backendImage) ? backendImage : 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '4000' }
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-key' }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
            { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAIDeployment }
            { name: 'AZURE_OPENAI_API_VERSION', value: '2024-12-01-preview' }
            { name: 'GEMINI_API_KEY', secretRef: 'gemini-api-key' }
            { name: 'VAPID_PUBLIC_KEY', secretRef: 'vapid-public-key' }
            { name: 'VAPID_PRIVATE_KEY', secretRef: 'vapid-private-key' }
            { name: 'VAPID_EMAIL', value: vapidEmail }
            { name: 'CORS_ORIGINS', value: 'https://${prefix}-frontend.${containerEnv.properties.defaultDomain}' }
          ]
          probes: !empty(backendImage) ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 4000
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 4000
              }
              initialDelaySeconds: 10
              periodSeconds: 10
            }
          ] : []
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// ── Frontend Container App ──────────────────────────────────
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-frontend'
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
          maxAge: 3600
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: !empty(frontendImage) ? frontendImage : 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: !empty(frontendImage) ? [
            {
              type: 'Liveness'
              httpGet: {
                path: '/'
                port: 80
              }
              periodSeconds: 30
            }
          ] : []
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
}

// ── Outputs ─────────────────────────────────────────────────
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output backendFqdn string = backendApp.properties.configuration.ingress.fqdn
output frontendFqdn string = frontendApp.properties.configuration.ingress.fqdn
output frontendUrl string = 'https://${frontendApp.properties.configuration.ingress.fqdn}'
output dbHost string = postgres.properties.fullyQualifiedDomainName
output containerEnvName string = containerEnv.name
