'use strict'

/**
client_id: 5895125cbdc6a41dfd904590
public_key: a1430f4f27921e4c6bdf5f37edfcfa
secret: 798c97303f8c1ffdb8f625c6d1626c
connect user: 18e05de266ef2c0436328e74634ddf91c3aa46f5e7f5ae9dd8a92a2ae4f9ef5c069ed155bfdbecc5ad0fa732b7be52cb8c38afb6a63e7eaee884abdf6234af39f8f460a0d96f46c5efa3e5f437ea8eb0

test client: test_id
test secret: test_secret
test access: test_chase, test_wells, test_citi, etc.

**/

const express = require('express')
const bodyParser = require('body-parser')
const plaid = require('plaid')
//const Cryptr = require('cryptr')
const knex = require('knex')({
  client: 'postgresql',
  connection: {
    user: 'super',
    database: 'subbit'
  }
})
const app = express()

const APP_PORT = process.env.APP_PORT || 9999
const { PLAID_CLIENT_ID, PLAID_SECRET } = process.env

const plaidClient = new plaid.Client(
  PLAID_CLIENT_ID,
  PLAID_SECRET,
  plaid.environments.tartan
)

//const cryptr = new Cryptr(PLAID_SECRET)

app.use(express.static(__dirname + '/public'))
app.use(bodyParser.json())

// Get all accounts associated with the provided institution & provided credentials
app.post('/connect', ({ body }, res) => {
  console.log('POST /connect')
  const public_token = body.token

  // Exchange public token for a user access token
  plaidClient.exchangeToken(public_token, (err, tokenResponse) => {
    if (err !== null) res.json({ error: 'Unable to exchange public token' })
    else {
      // Successful token exchange
      // Store the resulting access token into the database
      const access_token = tokenResponse.access_token
      console.log(`access_token: ${access_token}`)

      plaidClient.getConnectUser(access_token, (err, authResponse) => {
        if (err !== null) res.json({ error: 'Unable to pull accounts from Plaid API' })
        else {
          console.log(authResponse)
          // Filter out sensitive information
          // Return all of the user accounts
          res.json({ accounts: authResponse.accounts, access_token })
        }
      })
    }
  })
})

// Need a route to check what accounts the active user currently has
// and if access tokens exist, loop through all to get all of the appropriate
// accounts and transactions

// Need to refactor this to accept the user name as an argument rather than the
// access token
app.post('/connect/get', ({ body }, res) => {
  console.log('POST /connect/get')
  const username = body.username

  knex('users')
    .select('tokens')
    .where('username', username)
    .then(res => {
      // Checking if the current user has any previously registered accounts
      const tokens = res[0].tokens
      let transactions = [], accounts = []

      if (!tokens.length) return []

      return Promise.all(tokens.map(token => {
        return getMemberData(token)
      }))
        .then(responses => {
          return responses.map(formatResponse)
        })
        .then(responses => responses.reduce((obj, data) => {
          obj.accounts = [...obj.accounts, ...data.accounts]
          obj.transactions = [...obj.transactions, ...data.transactions]
          return obj
        }, { transactions, accounts }))
    })
    .then(result => res.json(result))
})

// Need a route to handle access token deletion

// API Testing for account transactions

//const access_token = '18e05de266ef2c0436328e74634ddf91c3aa46f5e7f5ae9dd8a92a2ae4f9ef5c069ed155bfdbecc5ad0fa732b7be52cb8c38afb6a63e7eaee884abdf6234af39f8f460a0d96f46c5efa3e5f437ea8eb0'
/**const access_token = 'test_chase'
plaidClient.getConnectUser(access_token, {}, (err, response) => {
  if (err !== null) {
    console.log(err)
    console.log('Could not retrieve auth user')
  }
  else {
    // Accounts: response.accounts, Transactions: response.transactions
    console.log('Auth user account details:')
    console.log(JSON.stringify(response, null, 2))
  }
})**/

// Token encryption
/**
console.log(cryptr)

const encrypted = cryptr.encrypt('18e05de266ef2c0436328e74634ddf91c3aa46f5e7f5ae9dd8a92a2ae4f9ef5c069ed155bfdbecc5ad0fa732b7be52cb8c38afb6a63e7eaee884abdf6234af39f8f460a0d96f46c5efa3e5f437ea8eb0')
const decrypted = cryptr.decrypt(encrypted)

console.log(encrypted)
console.log(decrypted)**/

// Asynchronously fetch a series of account details for a collection of tokens
function getMemberData(token) {
  return new Promise((resolve, reject) => {
    plaidClient.getConnectUser(token, {}, (err, response) => {
      if (err) reject(err)
      else resolve(response)
    })
  })
}

// Format accounts objects with relevant information
function formatAccounts(accounts) {
  return accounts.map(account => {
    return {
      balance: account.balance.current,
      number: account.meta.number,
      type: account.type
    }
  })
}

// Format transaction objects with relevant information
function formatTransactions(transactions) {
  return transactions.filter(transaction => {
    return !transaction.pending
  })
    .map(transaction => {
      return {
        amount: transaction.amount,
        date: transaction.date,
        name: transaction.name
      }
    })
}

// Format response objects with relevant information
function formatResponse(response) {
  return {
    accounts: formatAccounts(response.accounts),
    transactions: formatTransactions(response.transactions)
  }
}

app.listen(APP_PORT, () => console.log(`Listening on ${APP_PORT}`))
