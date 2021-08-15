import { recurse } from 'cypress-recurse';

context('Rate', () => {
  const authUrl = 'https://cognito-idp.ap-northeast-1.amazonaws.com/';
  let fetchedRate;

  before(() => {
    cy.task('generateRate').then((obj) => {
      fetchedRate = obj;
    });
  });

  beforeEach(() => {
    cy.fixture('users.json').as('users');
    cy.fixture('users').as('authenticatedUsers');
  });

  beforeEach(function () {
    const { username, password } = this.authenticatedUsers[0];

    cy.visit('/login');
    cy.fixture('users').should((users) => {
      const authorizedUser = users[0];

      expect('username' in authorizedUser).equal(true);
      expect('password' in authorizedUser).equal(true);
    });

    cy.get('#basic_username').type(username).should('have.value', username);
    cy.get('#basic_password').type(password).should('have.value', password);

    cy.on('uncaught:exception', (err, runnable) => false);
    cy.get('button').click();

    cy.intercept('POST', authUrl).as('authRequest');
    cy.wait('@authRequest', { timeout: 100000 }).wait('@authRequest', { timeout: 100000 });

    cy.get('[role="menuitem"]').eq(2).find('span:last a').should('contain', 'Rate').click();
  });

  it('should load data from the correct API and make repeated API calls', () => {
    cy.intercept('POST', '**/list').as('transactionPost');
    cy.intercept('POST', '**/rate').as('ratePost');

    return cy.wait('@transactionPost').then(({ _, response }) => {
      cy.get('@transactionPost.all').should('have.length', 1);

      expect(response.statusCode).equal(202);
      expect(response.url.endsWith('/transaction/list')).equal(true);

      cy.wait('@ratePost').then(({ _, response }) => {
        cy.get('@ratePost.all').should('have.length.at.least', 1);

        expect(response.statusCode).equal(200);
        expect(response.url.endsWith('/user/query/rate')).equal(true);

        cy.wait(3000);

        cy.get('@transactionPost.all').should((val) => {
          expect(val.length).greaterThan(1);
        });
        cy.get('@ratePost.all').should((val) => {
          expect(val.length).greaterThan(1);
        });
      });
    });
  });

  it('should ensure pagination works', () => {
    cy.intercept('POST', '**/rate', (req) => {
      req.reply(200, {
        success: true,
        result: fetchedRate,
      });
    }).as('ratePost');

    const pageLimit = 50; // this was forced in the page

    cy.get('.ant-pagination-options-size-changer:first div').click();
    cy.get('.ant-select-item-option-content')
      .eq(2) // pick 50
      .should('contain', `${pageLimit} / page`)
      .click();

    let page = 1;

    recurse(
      () => cy.get('button[class=ant-pagination-item-link]:last'),
      (nextBtn) => {
        cy.get('.ant-pagination-item-active:first').should('contain', page);
        cy.get('tbody tr:last td:first').should(
          'contain',
          fetchedRate[pageLimit * page - 1].currency,
        );

        return nextBtn.prop('disabled');
      },
      {
        post: () => {
          page++;

          cy.get('button[class=ant-pagination-item-link]:last').click();
        },
        timeout: 60000,
      },
    );
  });

  it('should add currency by opening add currency modal form', () => {
    cy.get('button#open-ac-modal').should('be.visible').click();
    cy.get('.add-modal').should('exist').get('form#addCurrency').should('exist');

    cy.fixture('currency.json').should((currencySchema) => {
      const { currency, buySchema, sellSchema } = currencySchema;

      cy.get('input#addCurrency_currency')
        .type(currency)
        .get('input#addCurrency_buySchema_spread_1')
        .type(buySchema.spread_1)
        .get('input#addCurrency_buySchema_spread_2')
        .type(buySchema.spread_2)
        .get('input#addCurrency_buySchema_spread_3')
        .type(buySchema.spread_3)
        .get('input#addCurrency_sellSchema_spread_1')
        .type(sellSchema.spread_1)
        .get('input#addCurrency_sellSchema_spread_2')
        .type(sellSchema.spread_2)
        .get('input#addCurrency_sellSchema_spread_3')
        .type(sellSchema.spread_3);

      cy.get('button.ant-modal-close').should('be.visible').click();
    });
  });

  it('should edit currency by fetching sell currency', () => {
    cy.contains('Rate table')
      .get('.ant-table-tbody')
      .get('tr.ant-table-row', { timeout: 10000 })
      .should('be.visible')
      .should('have.length.at.least', 1)
      .get('tr.ant-table-row:first td:first')
      .invoke('text')
      .as('currency');
  });

  it('should edit currency by fetching buy currency', () => {
    cy.contains('Rate table')
      .get('.ant-table-tbody')
      .get('tr.ant-table-row', { timeout: 10000 })
      .should('be.visible')
      .should('have.length.at.least', 1)
      .get('tr.ant-table-row:first td:first')
      .invoke('text')
      .as('currency');
  });

  it('should remove currency', () => {
    cy.intercept('DELETE', `**/v5/nk/remove_currency`, {
      statusCode: 200,
      body: {
        success: true,
      },
    }).as('removeCurrency');

    cy.contains('Rate table')
      .get('.ant-table-tbody')
      .get('tr.ant-table-row', { timeout: 10000 })
      .should('be.visible')
      .should('have.length.at.least', 1)
      .get('tr.ant-table-row:first td:first .curreny-name button')
      .click();

    cy.contains('Are you sure to delete this currency?').get('.confirm-no').click();
  });
});
