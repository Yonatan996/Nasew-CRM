import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'nasew-crm-local-secret';

export const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
};

export const createToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
    },
    secret,
    { expiresIn: '8h' },
  );

export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.auth = jwt.verify(token, secret);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.auth?.role || !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'You do not have access to this resource.' });
    }

    return next();
  };
