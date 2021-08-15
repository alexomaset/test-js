import { recurse } from 'cypress-recurse';

context('Transaction', () => {
  const authUrl = 'https://cognito-idp.ap-northeast-1.amazonaws.com/';
  let fetchedTransaction;

  const cyInterceptTransaction = (transaction) => {
    cy.intercept('GET', '**/list', (req) => {
      req.reply(200, {
        status: 'successful',
        transaction,
      });
    }).as('transactionPost');
  };

  before(() => {
    cy.task('generateTransaction').then((obj) => {
      fetchedTransaction = obj;
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

    cy.get('[role="menuitem"]').eq(1).find('span:last a').should('contain', 'Transaction').click();
  });

  afterEach(() => {
    if (window.Audio.restore) window.Audio.restore();
  });

  it('should load data from the correct API and make repeated API calls', () => {
    cy.intercept('GET', '**/list').as('transactionPost');
    return cy.wait('@transactionPost').then(({ _, response }) => {
      cy.get('@transactionPost.all').should('have.length', 1);

      expect(response.statusCode).equal(200);
      expect(response.url.endsWith('/transaction/list')).equal(true);
      cy.wait(3000);
      cy.get('@transactionPost.all').should((val) => {
        expect(val.length).greaterThan(1);
      });
    });
  });

  it('should ensure pagination works', () => {
    cyInterceptTransaction({
      Count: fetchedTransaction.length,
      Items: fetchedTransaction,
      ScannedCount: fetchedTransaction.length,
    });

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
        const transactionSortedByCreated = [...fetchedTransaction].sort((a, b) =>
          a.created < b.created ? 1 : -1,
        );

        cy.get('.ant-pagination-item-active:first').should('contain', page);
        cy.get('tbody tr:last td')
          .eq(5)
          .should('contain', transactionSortedByCreated[pageLimit * page - 1].username);
        cy.get('tbody tr:last td')
          .eq(1)
          .should('contain', transactionSortedByCreated[pageLimit * page - 1].created);

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

  it('should ensure filtering works', () => {
    cyInterceptTransaction({
      Count: fetchedTransaction.length,
      Items: fetchedTransaction,
      ScannedCount: fetchedTransaction.length,
    });

    cy.reload();
    let filterItemsIndex = 0;
    recurse(
      () => {
        cy.get('span[class=ant-table-filter-trigger-container]:first')
          .should('exist')
          .wait(1000)
          .click();

        return cy.get('.ant-table-filter-dropdown > ul > li').eq(filterItemsIndex);
      },
      () => {
        return filterItemsIndex > 2;
      },
      {
        post: () => {
          let currentFilteredCount = 0;

          cy.get('.ant-table-filter-dropdown > ul > li')
            .eq(filterItemsIndex)
            .click({ force: true })
            .find('input')
            .should('be.checked');

          return cy
            .get('.ant-table-filter-dropdown > ul > li')
            .eq(filterItemsIndex)
            .find('span')
            .last()
            .should(($span) => {
              const filteredTransaction = fetchedTransaction.filter(
                ({ status }) => status === $span.text(),
              );

              currentFilteredCount = filteredTransaction.length;
            })
            .then(() => {
              cy.get('.ant-table-filter-dropdown-btns button:last span')
                .should('contain', 'OK')
                .click({ force: true });

              if (currentFilteredCount) {
                cy.get('tbody:first tr')
                  .should('have.length', currentFilteredCount + 1) // table Item adds 1 tr before other trs in the page
                  .should('have.class', 'ant-table-row');
              } else {
                cy.get('tbody:first tr')
                  .should('have.length', 2)
                  .should('have.class', 'ant-table-placeholder');
              }

              cy.get('span[class=ant-table-filter-trigger-container]:first')
                .should('exist')
                .click();

              cy.get('.ant-table-filter-dropdown-btns button:first span')
                .should('contain', 'Reset')
                .click({ force: true });

              filterItemsIndex++;
            });
        },
        timeout: 100000,
      },
    );
  });

  it('should ensure sorting works on created column', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);
    const ascendingSortedTransaction = [
      { created: '', username: '' },
      ...[...slicedFetchedTransaction].sort((a, b) => (a.created > b.created ? 1 : -1)),
    ];
    const decendingSortedTransaction = [
      { created: '', username: '' },
      ...[...slicedFetchedTransaction].sort((a, b) => (a.created < b.created ? 1 : -1)),
    ];
    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    cy.wait('@transactionPost', { timeout: 10000 });

    cy.get('tbody tr td:nth-child(2)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(decendingSortedTransaction[index].created).equal(element.title);
      });
    });
    cy.get('tbody tr td:nth-child(6)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(decendingSortedTransaction[index].username).equal(element.title);
      });
    });

    cy.get('span[class=ant-table-column-sorter-inner]:first > span').should(($sortArrowElems) => {
      expect($sortArrowElems[0].classList.contains('active')).equal(false);
      expect($sortArrowElems[1].classList.contains('active')).equal(true);
    });

    cy.get('.ant-table-column-sorters:first span:first').should('contain', 'created').click();

    cy.get('span[class=ant-table-column-sorter-inner]:first > span').should(($sortArrowElems) => {
      expect($sortArrowElems[0].classList.contains('active')).equal(true);
      expect($sortArrowElems[1].classList.contains('active')).equal(false);
    });

    cy.get('tbody tr td:nth-child(2)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(ascendingSortedTransaction[index].created).equal(element.title);
      });
    });
    cy.get('tbody tr td:nth-child(6)').should(($sortArrowElems) => {
      $sortArrowElems.each((index, element) => {
        expect(ascendingSortedTransaction[index].username).equal(element.title);
      });
    });
  });

  it('Alert toggle works, and when it is on, the page plays a sound with new transactions', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);
    let playCount = 0;

    cy.visit('/home/transaction', {
      onBeforeLoad: (win) => {
        const OriginalAudio = win.Audio;
        cy.stub(win, 'Audio').callsFake((arg) => {
          const aud = new OriginalAudio(arg);
          cy.stub(aud, 'play').callsFake(() => {});
          return aud;
        });
      },
    }).then(() => {
      playCount = playCount + 1;
    });

    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    return cy
      .wait('@transactionPost')
      .wait(3000)
      .then(() => {
        expect(playCount).equal(1);

        cy.get('button[role=switch] > span')
          .should('contain', 'Alert On')
          .wait(100)
          .click()
          .should('contain', 'Alert Off');

        const newResult1 = fetchedTransaction.slice(0, 11);

        cy.intercept('POST', '**/list', (req) => {
          req.reply(202, {
            status: 'successful',
            transaction: {
              Count: newResult1.length,
              Items: newResult1,
              ScannedCount: newResult1.length,
            },
          });
        }).as('transactionPost');

        return cy
          .wait('@transactionPost')
          .wait(3000)
          .then(() => {
            expect(playCount).equal(1);

            cy.get('button[role=switch] > span')
              .should('contain', 'Alert Off')
              .wait(100)
              .click()
              .should('contain', 'Alert On');

            const newResult2 = fetchedTransaction.slice(0, 12);
            cy.intercept('POST', '**/list', (req) => {
              req.reply(202, {
                status: 'successful',
                transaction: {
                  Count: newResult2.length,
                  Items: newResult2,
                  ScannedCount: newResult2.length,
                },
              });
            }).as('transactionPost');

            cy.wait('@transactionPost')
              .wait(3000)
              .then(() => {
                expect(playCount).equal(1);
              });
          });
      });
  });

  it('Toggle detail button works and only opens current row', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);

    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    cy.wait('@transactionPost', { timeout: 100000 });

    cy.get('[data-cy=more-details-table]').should('have.length', 0);

    cy.get('tbody tr td:nth-child(1)').eq(1).click({ timeout: 10000 });

    cy.get('[data-cy=more-details-table]').should(
      'not.have.length',
      slicedFetchedTransaction.length,
    );

    cy.get('[data-cy=more-details-table]').should('have.length', 1).should('be.visible');

    cy.get('tbody tr td:nth-child(1)').eq(1).click();

    cy.get('[data-cy=more-details-table]').should('not.be.visible');
  });

  it('Expand/collapse all button opens and closes all rows', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);

    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    cy.wait('@transactionPost', { timeout: 100000 });

    cy.get('[data-cy=more-details-table]').should('have.length', 0);

    cy.get('[data-cy=expand-collapse-all]').eq(0).click({ timeout: 10000 });

    cy.get('[data-cy=more-details-table]')
      .should('have.length', slicedFetchedTransaction.length)
      .should('be.visible');

    cy.get('[data-cy=expand-collapse-all]').eq(0).click();

    cy.get('[data-cy=more-details-table]').should('not.be.visible');
  });

  it('Confirm buttons work', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);

    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    cy.intercept('POST', '**/confirm', (req) => {
      expect(req.url.endsWith('/confirm')).equal(true);
      expect(req.body.status).equal('executed');
    }).as('confirmPost');

    cy.wait('@transactionPost', { timeout: 100000 });

    cy.contains('Confirm').first().click();
  });

  it('Reject buttons work', () => {
    const slicedFetchedTransaction = fetchedTransaction.slice(0, 10);

    cyInterceptTransaction({
      Count: slicedFetchedTransaction.length,
      Items: slicedFetchedTransaction,
      ScannedCount: slicedFetchedTransaction.length,
    });

    cy.intercept('POST', '**/confirm', (req) => {
      expect(req.url.endsWith('/confirm')).equal(true);
      expect(req.body.status).equal('rejected');
    }).as('confirmPost');

    cy.wait('@transactionPost', { timeout: 100000 });

    cy.contains('Reject').first().click();
  });
  it('Should validate user and display user and balance details', () => {
    cy.get('[role="menuitem"]')
      .eq(3)
      .find('span:last a')
      .should('contain', 'Add Transaction')
      .click();

    cy.get('#basic_username').focus().type('alex@pecutus.com').blur();
    cy.wait(3000);
    cy.get('.user-desc-tile').should('be.visible');
    cy.get('.balance-desc-tile').should('be.visible');
  });

  it('Should validate user and show error if invalid', () => {
    cy.get('[role="menuitem"]')
      .eq(3)
      .find('span:last a')
      .should('contain', 'Add Transaction')
      .click();
    cy.get('#basic_username').focus().type('alex@pecutus1263.com').blur();
    cy.contains('Bad Request: Username is invalid');
  });
});
