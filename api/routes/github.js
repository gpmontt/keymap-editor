const { Router } = require('express')

const {
  getOauthToken,
  getOauthUser,
  getUserToken,
  verifyUserToken,
  fetchInstallation,
  fetchInstallationRepos,
  fetchKeyboardFiles,
  createOauthFlowUrl,
  createOauthReturnUrl,
  commitChanges
} = require('../services/github')

const router = Router()

const authorize = async (req, res) => {
  if (req.query.code) {
    try {
      const { data: oauth } = await getOauthToken(req.query.code)
      const { data: user } = await getOauthUser(oauth.access_token)
      const token = getUserToken(oauth, user)
      res.redirect(createOauthReturnUrl(token))
    } catch (err) {
      const message = err.response ? err.response.data : err
      console.error(message)
      res.sendStatus(500)
    }
  } else {
    res.redirect(createOauthFlowUrl())
  }
}

const handleError = (err, req, res, next) => {
  const message = err.response ? `[${err.response.status}] ${err.response.data}` : err
  console.error(message, err)

  if (err.response && err.response.status === 401) {
    console.error('Received upstream authentication error', err.re)
    return res.sendStatus(401)
  }

  res.sendStatus(500)
}

const authenticate = (req, res, next) => {
  const header = req.headers.authorization
  const token = (header || '').split(' ')[1]

  if (!token) {
    return res.sendStatus(401)
  }

  try {
    req.user = verifyUserToken(token)
  } catch (err) {
    return res.sendStatus(401)
  }

  next()
}

const getInstallation = async (req, res, next) => {
  const { user } = req
  
  try {
    const { data: installation } = await fetchInstallation(user.sub)

    if (!installation) {
      return res.json({ installation: null })
    }

    const { data: { repositories } } = await fetchInstallationRepos(user.oauth_access_token, installation.id)

    res.json({ installation, repositories })
  } catch (err) {
    next(err)
  }
}

const getKeyboardFiles = async (req, res, next) => {
  const { installationId, repository } = req.params

  try {
    const keyboardFiles = await fetchKeyboardFiles(installationId, repository)
    res.json(keyboardFiles)
  } catch (err) {
    next(err)
  }
}

const updateKeyboardFiles = async (req, res, next) => {
  const { installationId, repository } = req.params
  const { keymap, layout } = req.body

  try {
    await commitChanges(installationId, repository, layout, keymap)
  } catch (err) {
    return next(err)
  }

  res.sendStatus(200)
}

const receiveWebhook = (req, res) => {
  res.sendStatus(200)
}

router.use(handleError)
router.get('/authorize', authorize)
router.get('/installation', authenticate, getInstallation)
router.get('/keyboard-files/:installationId/:repository', authenticate, getKeyboardFiles)
router.post('/keyboard-files/:installationId/:repository', authenticate, updateKeyboardFiles)
router.post('/webhook', receiveWebhook)

module.exports = router
