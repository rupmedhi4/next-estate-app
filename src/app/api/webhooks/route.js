export const runtime = 'nodejs'; // <- ye add karo

import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { clerkClient } from '@clerk/nextjs/server';
import { createOrUpdateUser, deleteUser } from '@/lib/actions/user';

export async function POST(req) {
  try {
    // Verify Clerk webhook
    const evt = await verifyWebhook(req);

    const { id } = evt.data; // Clerk user ID
    const eventType = evt.type;

    console.log(`Webhook event: ${eventType}`);
    console.log(`Clerk userId: ${id}`);

    // ============================
    // USER CREATED / UPDATED
    // ============================
    if (eventType === 'user.created' || eventType === 'user.updated') {
      const { first_name, last_name, email_addresses, image_url } = evt.data;

      // Pick first verified email or fallback to first email
      const emailObj = email_addresses?.find(e => e.verification?.status === 'verified') || email_addresses?.[0];

      if (!emailObj || !emailObj.email_address) {
        console.error(`User ${id} has no email. Skipping creation.`);
        return new Response('No email, skipping user', { status: 200 });
      }

      const email = emailObj.email_address;

      // Save or update user in MongoDB
      let user;
      try {
        user = await createOrUpdateUser(
          id,
          first_name,
          last_name,
          image_url,
          email
        );
        console.log('User saved/updated in Mongo:', user);
      } catch (err) {
        console.error('Could not create or update user:', err);
        return new Response('Mongo error', { status: 500 });
      }

      // If new user, save MongoId to Clerk metadata
      if (user && eventType === 'user.created') {
        try {
          // Optional delay for timing issues
          await new Promise(r => setTimeout(r, 1000));

          const updatedUser = await clerkClient.users.updateUserMetadata(id, {
            publicMetadata: {
              userMongoId: user._id.toString(),
            },
          });

          console.log('Clerk metadata updated successfully', updatedUser);
        } catch (error) {
          console.error('Error updating Clerk metadata:', error);
        }
      }
    }

    // ============================
    // USER DELETED
    // ============================
    if (eventType === 'user.deleted') {
      try {
        await deleteUser(id);
        console.log('User deleted from Mongo:', id);
      } catch (error) {
        console.error('Error deleting user:', error);
        return new Response('Error deleting user', { status: 400 });
      }
    }

    return new Response('Webhook received', { status: 200 });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return new Response('Error verifying webhook', { status: 400 });
  }
}
