import { randomUUID } from "node:crypto";
import { Membership } from "../models/membership.js";
import { OAuthState } from "../models/oauth-state.js";
import { Organization } from "../models/organization.js";
import { Session } from "../models/session.js";
import { User } from "../models/user.js";

const plain = (document) => document?.toObject?.() ?? document ?? null;

export const mongooseAuthRepository = {
  createOAuthState(input) { return OAuthState.create(input); },
  consumeOAuthState(stateHash, browserNonceHash) {
    return OAuthState.findOneAndDelete({
      stateHash,
      browserNonceHash,
      expiresAt: { $gt: new Date() },
    }).select("+stateHash +browserNonceHash +codeVerifier");
  },
  findUserByIdentity(provider, providerUserId) {
    return User.findOne({
      identities: { $elemMatch: { provider, providerUserId } },
    }).select("+identities.accessToken +identities.refreshToken");
  },
  async createUserWithPersonalOrganization({ profile, identity }) {
    const organization = await Organization.create({
      name: `${profile.name}'s workspace`,
      slug: `personal-${randomUUID()}`,
    });
    let user;
    try {
      user = await User.create({ ...profile, identities: [identity] });
      await Membership.create({
        organizationId: organization._id, userId: user._id, role: "owner",
      });
      return { user: plain(user), organization: plain(organization), role: "owner" };
    } catch (error) {
      await Promise.all([
        user ? User.deleteOne({ _id: user._id }) : Promise.resolve(),
        Organization.deleteOne({ _id: organization._id }),
      ]);
      throw error;
    }
  },
  async updateIdentity(userId, provider, identity) {
    await User.updateOne(
      { _id: userId, "identities.provider": provider },
      { $set: {
        "identities.$.accessToken": identity.accessToken,
        "identities.$.refreshToken": identity.refreshToken,
      } },
    );
  },
  firstMembership(userId) {
    return Membership.findOne({ userId }).sort({ role: 1, createdAt: 1 });
  },
  createSession(input) { return Session.create(input); },
  findSession(tokenHash) {
    return Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      .select("+tokenHash +csrfToken");
  },
  deleteSession(tokenHash) { return Session.deleteOne({ tokenHash }); },
  findUser(id) { return User.findById(id); },
  findMembership(userId, organizationId) {
    return Membership.findOne({ userId, organizationId });
  },
  findOrganization(id) { return Organization.findById(id); },
};
