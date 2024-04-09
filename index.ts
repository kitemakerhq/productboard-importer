import commandLineArgs from 'command-line-args';
import 'cross-fetch/polyfill';
import { Client, fetchExchange, gql } from '@urql/core';
import { readFileSync } from 'fs';
import { uniq } from 'lodash';

if (!process.env.KITEMAKER_TOKEN) {
  console.error(
    'Could not find Kitemaker token. Make sure the KITEMAKER_TOKEN environment variable is set.'
  );
  process.exit(-1);
}

const host = process.env.KITEMAKER_HOST ?? 'https://toil.kitemaker.co';

const client = new Client({
  url: `${host}/developers/graphql`,
  exchanges: [fetchExchange],
  fetchOptions: () => {
    return {
      headers: { authorization: `Bearer ${process.env.KITEMAKER_TOKEN}` },
    };
  },
});

const opts = commandLineArgs([
  { name: 'space', alias: 's', type: String },
  { name: 'notes', alias: 'n', type: String },
  { name: 'features', alias: 'f', type: String },
]);

if (!opts.space || !opts.notes || !opts.features) {
  console.error('Please provide the space, notes, and features options');
  process.exit(-1);
}

async function importData() {
  const features = JSON.parse(readFileSync(opts.features).toString('utf-8'));
  const notes = JSON.parse(readFileSync(opts.notes).toString('utf-8'));
  const statuses: string[] = uniq(features.map((f: any) => f.status));
  const companies = uniq(notes.map((n: any) => n.company)).filter((c: any) => !!c) as string[];

  try {
    // need to grab the statuses so we can match them up with the feature statuses
    const { data, error } = await client.query(
      gql`
        query Space($spaceKey: String!) {
          spaceByKey(key: $spaceKey) {
            id
            name
            statuses {
              id
              name
            }
          }
        }
      `,
      { spaceKey: opts.space }
    );

    if (error && !data) {
      console.error('Error fetching space', error.message, JSON.stringify(error, null, '  '));
      process.exit(-1);
    }

    console.log('Space fetched:', data.spaceByKey.name);

    const space = data.spaceByKey;

    const statusMap: Record<string, string> = {};

    for (const status of statuses) {
      const kmStatus = space.statuses.find(
        (s: any) => s.name.toLowerCase() === status.toLowerCase()
      );
      if (!kmStatus) {
        console.error(`Could not find status "${status}" in Kitemaker`);
        process.exit(-1);
      }
      statusMap[status] = kmStatus.id;
    }

    const workItemMap: Record<string, string> = {};
    for (const feature of features.reverse()) {
      const { data, error } = await client.mutation(
        gql`
          mutation CreateWorkItem(
            $spaceId: ID!
            $title: String!
            $description: String
            $statusId: ID!
            $createdAt: Date
            $updatedAt: Date
          ) {
            createWorkItem(
              input: {
                spaceId: $spaceId
                title: $title
                description: $description
                statusId: $statusId
                createdAt: $createdAt
                updatedAt: $updatedAt
              }
            ) {
              workItem {
                id
              }
            }
          }
        `,
        {
          spaceId: space.id,
          title: feature.name,
          description: feature.description,
          statusId: statusMap[feature.status],
          createdAt: feature.createdAt,
          updatedAt: feature.createdAt,
        }
      );

      if (error && !data) {
        console.error('Error creating work item', error.message, JSON.stringify(error, null, '  '));
        process.exit(-1);
      }

      workItemMap[feature.id] = data.createWorkItem.workItem.id;
    }

    console.log('Work items created:', Object.keys(workItemMap).length);

    if (companies.length !== 0) {
      process.exit(0);
    }
    const companyMap: Record<string, string> = {};

    for (const company of companies) {
      const { data, error } = await client.mutation(
        gql`
          mutation CreateCompany($name: String!) {
            createCompany(input: { name: $name }) {
              company {
                id
              }
            }
          }
        `,
        {
          name: company,
        }
      );

      if (error && !data) {
        console.error('Error creating company', error.message, JSON.stringify(error, null, '  '));
        process.exit(-1);
      }

      companyMap[company] = data.createCompany.company.id;
    }

    console.log('Companies created', Object.keys(companyMap).length);
    const feedbacks: Record<string, string> = {};

    for (const note of notes) {
      const { data, error } = await client.mutation(
        gql`
          mutation CreateFeedback(
            $title: String!
            $content: String
            $companyId: ID
            $linkInsightToEntityIds: [ID!]
            $createdAt: Date
            $updatedAt: Date
          ) {
            createFeedback(
              input: {
                title: $title
                content: $content
                companyId: $companyId
                linkInsightToEntityIds: $linkInsightToEntityIds
                createdAt: $createdAt
                updatedAt: $updatedAt
              }
            ) {
              feedback {
                id
              }
            }
          }
        `,
        {
          title: note.title,
          content: note.content,
          companyId: companyMap[note.company],
          linkInsightToEntityIds: (note.features ?? [])
            .map((s: string) => workItemMap[s])
            .filter((s: string) => !!s),
          createdAt: note.createdAt,
          updatedAt: note.createdAt,
        }
      );

      if (error && !data) {
        console.error('Error creating feedback', error.message, JSON.stringify(error, null, '  '));
        process.exit(-1);
      }

      feedbacks[note.id] = data.createFeedback.feedback.id;
    }

    console.log('Feedback created', Object.keys(feedbacks).length);
  } catch (e: any) {
    console.error('Error importing ProductBoard data', e.message, JSON.stringify(e, null, '  '));
  }
}

importData();
