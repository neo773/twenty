import gql from 'graphql-tag';
import { createManyOperationFactory } from 'test/integration/graphql/utils/create-many-operation-factory.util';
import { makeGraphqlAPIRequest } from 'test/integration/graphql/utils/make-graphql-api-request.util';
import { deleteAllRecords } from 'test/integration/utils/delete-all-records';

const MERGE_PEOPLE_GQL_FIELDS = `
  id
  jobTitle
  name {
    firstName
    lastName
  }   
  emails {
    primaryEmail
    additionalEmails
  }
  phones {
    primaryPhoneNumber
    primaryPhoneCountryCode
    primaryPhoneCallingCode
    additionalPhones
  }
  linkedinLink {
    primaryLinkLabel
    primaryLinkUrl
    secondaryLinks
  }
`;

describe('merge people resolvers (integration)', () => {
  beforeAll(async () => {
    await deleteAllRecords('person');
  });

  it('should merge people with email consolidation', async () => {
    // Create test people with different emails
    const createPeopleOperation = createManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: MERGE_PEOPLE_GQL_FIELDS,
      data: [
        {
          name: {
            firstName: 'John',
            lastName: 'Doe',
          },
          jobTitle: 'Software Engineer',
          emails: {
            primaryEmail: 'john@example.com',
            additionalEmails: ['john.doe@company.com'],
          },
        },
        {
          name: {
            firstName: 'John',
            lastName: 'Doe',
          },
          jobTitle: 'Senior Developer',
          emails: {
            primaryEmail: 'jane@example.com',
            additionalEmails: ['john@example.com', 'j.doe@work.com'],
          },
        },
      ],
    });

    const createResponse = await makeGraphqlAPIRequest(createPeopleOperation);

    expect(createResponse.body.data).toBeDefined();
    expect(createResponse.body.errors).toBeUndefined();

    const createdPeople = createResponse.body.data.createPeople;
    const personIds = createdPeople.map((person: any) => person.id);

    // Merge the people
    const mergeOperation = {
      query: gql`
        mutation mergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!) {
          mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) {
            ${MERGE_PEOPLE_GQL_FIELDS}
          }
        }
      `,
      variables: {
        ids: personIds,
        conflictPriorityIndex: 0,
      },
    };

    const mergeResponse = await makeGraphqlAPIRequest(mergeOperation);

    expect(mergeResponse.body.data).toBeDefined();
    expect(mergeResponse.body.errors).toBeUndefined();

    const mergedPerson = mergeResponse.body.data.mergePeople;

    // Verify email consolidation
    expect(mergedPerson.emails.primaryEmail).toBe('john@example.com');
    expect(mergedPerson.emails.additionalEmails).toEqual(
      expect.arrayContaining([
        'john.doe@company.com',
        'jane@example.com',
        'j.doe@work.com',
      ]),
    );
    expect(mergedPerson.emails.additionalEmails).toHaveLength(3);

    // Verify other fields use priority logic
    expect(mergedPerson.jobTitle).toBe('Software Engineer');
    expect(mergedPerson.name.firstName).toBe('John');
    expect(mergedPerson.name.lastName).toBe('Doe');
  });

  it('should merge people with phone consolidation', async () => {
    await deleteAllRecords('person');

    const createPeopleOperation = createManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: MERGE_PEOPLE_GQL_FIELDS,
      data: [
        {
          name: {
            firstName: 'Alice',
            lastName: 'Johnson',
          },
          phones: {
            primaryPhoneNumber: '+1234567890',
            primaryPhoneCountryCode: 'US',
            primaryPhoneCallingCode: '+1',
            additionalPhones: [
              { number: '+1987654321', countryCode: 'US', callingCode: '+1' },
            ],
          },
        },
        {
          name: {
            firstName: 'Alice',
            lastName: 'Johnson',
          },
          phones: {
            primaryPhoneNumber: '+33123456789',
            primaryPhoneCountryCode: 'FR',
            primaryPhoneCallingCode: '+33',
            additionalPhones: null,
          },
        },
      ],
    });

    const createResponse = await makeGraphqlAPIRequest(createPeopleOperation);
    const createdPeople = createResponse.body.data.createPeople;
    const personIds = createdPeople.map((person: any) => person.id);

    const mergeOperation = {
      query: gql`
        mutation mergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!) {
          mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) {
            ${MERGE_PEOPLE_GQL_FIELDS}
          }
        }
      `,
      variables: {
        ids: personIds,
        conflictPriorityIndex: 0,
      },
    };

    const mergeResponse = await makeGraphqlAPIRequest(mergeOperation);
    const mergedPerson = mergeResponse.body.data.mergePeople;

    expect(mergedPerson.phones.primaryPhoneNumber).toBe('234567890');
    expect(mergedPerson.phones.additionalPhones).toEqual(
      expect.arrayContaining([
        { number: '987654321', countryCode: 'US', callingCode: '+1' },
        '123456789',
      ]),
    );
    expect(mergedPerson.phones.additionalPhones).toHaveLength(2);
  });

  it('should merge people with links consolidation', async () => {
    await deleteAllRecords('person');

    const createPeopleOperation = createManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: MERGE_PEOPLE_GQL_FIELDS,
      data: [
        {
          name: {
            firstName: 'Bob',
            lastName: 'Wilson',
          },
          linkedinLink: {
            primaryLinkLabel: 'LinkedIn',
            primaryLinkUrl: 'https://linkedin.com/in/bob',
            secondaryLinks: [
              { label: 'Twitter', url: 'https://twitter.com/bob' },
            ],
          },
        },
        {
          name: {
            firstName: 'Bob',
            lastName: 'Wilson',
          },
          linkedinLink: {
            primaryLinkLabel: 'GitHub',
            primaryLinkUrl: 'https://github.com/bob',
            secondaryLinks: null,
          },
        },
      ],
    });

    const createResponse = await makeGraphqlAPIRequest(createPeopleOperation);
    const createdPeople = createResponse.body.data.createPeople;
    const personIds = createdPeople.map((person: any) => person.id);

    const mergeOperation = {
      query: gql`
        mutation mergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!) {
          mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) {
            ${MERGE_PEOPLE_GQL_FIELDS}
          }
        }
      `,
      variables: {
        ids: personIds,
        conflictPriorityIndex: 0,
      },
    };

    const mergeResponse = await makeGraphqlAPIRequest(mergeOperation);
    const mergedPerson = mergeResponse.body.data.mergePeople;

    expect(mergedPerson.linkedinLink.primaryLinkUrl).toBe(
      'https://linkedin.com/in/bob',
    );
    expect(mergedPerson.linkedinLink.secondaryLinks).toEqual(
      expect.arrayContaining([
        { label: 'Twitter', url: 'https://twitter.com/bob' },
        'https://github.com/bob',
      ]),
    );
    expect(mergedPerson.linkedinLink.secondaryLinks).toHaveLength(2);
  });

  it('should handle case-insensitive email deduplication', async () => {
    await deleteAllRecords('person');

    const createPeopleOperation = createManyOperationFactory({
      objectMetadataSingularName: 'person',
      objectMetadataPluralName: 'people',
      gqlFields: MERGE_PEOPLE_GQL_FIELDS,
      data: [
        {
          name: {
            firstName: 'Test',
            lastName: 'User',
          },
          emails: {
            primaryEmail: 'test@example.com',
            additionalEmails: ['Test@Example.com', 'work@company.com'],
          },
        },
        {
          name: {
            firstName: 'Test',
            lastName: 'User',
          },
          emails: {
            primaryEmail: 'WORK@COMPANY.COM',
            additionalEmails: ['test@example.com'],
          },
        },
      ],
    });

    const createResponse = await makeGraphqlAPIRequest(createPeopleOperation);
    const createdPeople = createResponse.body.data.createPeople;
    const personIds = createdPeople.map((person: any) => person.id);

    const mergeOperation = {
      query: gql`
        mutation mergePeople($ids: [UUID!]!, $conflictPriorityIndex: Int!) {
          mergePeople(ids: $ids, conflictPriorityIndex: $conflictPriorityIndex) {
            ${MERGE_PEOPLE_GQL_FIELDS}
          }
        }
      `,
      variables: {
        ids: personIds,
        conflictPriorityIndex: 0,
      },
    };

    const mergeResponse = await makeGraphqlAPIRequest(mergeOperation);
    const mergedPerson = mergeResponse.body.data.mergePeople;

    expect(mergedPerson.emails.primaryEmail).toBe('test@example.com');
    expect(mergedPerson.emails.additionalEmails).toEqual(['work@company.com']);
    expect(mergedPerson.emails.additionalEmails).toHaveLength(1);
  });
});
