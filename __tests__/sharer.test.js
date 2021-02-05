const {shareDocumentWithStudents} = require('../sharer')

jest.mock('../liqpay.js', () =>
  jest.fn().mockImplementation(function mockLiqPay() {
    this.api = mockLiqpayApi
  })
)

const mockLiqpayApi = jest.fn().mockImplementation((_, __, resolve, reject) => {
  resolve({data: []})
})

jest.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: jest.fn().mockImplementation(function () {
        this.authorize = jest.fn();
        this.credentials = {
          access_token: ''
        }
      })
    },
    drive: jest.fn(() => ({
      permissions: {
        list: mockGoogleDrivePermissionsList,
        create: mockGoogleDrivePermissionsCreate
      }
    }))
  },
}))

const { google } = require('googleapis')

const mockGoogleDrivePermissionsList = jest.fn().mockResolvedValue({
  data: {
    permissions: []
  }
})

const mockGoogleDrivePermissionsCreate = jest.fn()

describe('sharer', () => {
  const FAKE_FILE_ID = "FAKE_ID";
  const EXPECTED_DESCRIPTION = "Мастер-класс по Unit-тестированию JS";

  it('works', async () => {
    await shareDocumentWithStudents(FAKE_FILE_ID)
  })

  it('calls authorize if googleJWT instantiating is successful', async () => {
    await shareDocumentWithStudents(FAKE_FILE_ID)

    const [jwtInstance] = google.auth.JWT.mock.instances
    expect(jwtInstance.authorize).toHaveBeenCalled()
  })

  describe('when person paid but is not in enrolled list', () => {
    const NEW_EMAILS = [
      'email1@email.email',
      'email2@email.email',
    ];

    const ENROLLED_EMAILS = [
      'email3@email.email',
      'email4@email.email',
    ]

    const PAID_EMAILS = [
      ...NEW_EMAILS,
      ...ENROLLED_EMAILS
    ]

    beforeEach(() => {
      expect.hasAssertions()

      mockLiqpayApi.mockImplementation((_, __, resolve) => {
        const paymentData = []
        for (const paidEmail of PAID_EMAILS) {
          paymentData.push({
            description: EXPECTED_DESCRIPTION,
            status: 'success',
            order_id: `${paidEmail} /// some unused text`
          })
        }
        resolve({data: paymentData})
      })

      const enrolledEmails = ENROLLED_EMAILS.map((email) => ({emailAddress: email}))
      mockGoogleDrivePermissionsList.mockResolvedValue({
        data: {
          permissions: enrolledEmails
        }
      })

    })

    it("requests commenter access from google drive", async () => {
      await shareDocumentWithStudents(FAKE_FILE_ID)

      for (const newEmail of NEW_EMAILS) {
        expect(mockGoogleDrivePermissionsCreate).toHaveBeenCalledWith(expect.objectContaining({
          fileId: FAKE_FILE_ID,
          emailAddress: newEmail,
          resource: expect.objectContaining({
            emailAddress: newEmail,
            type: 'user',
            role: 'commenter',
          })
        }))
      }

      for (const enrolledEmail of ENROLLED_EMAILS) {
        expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalledWith(expect.objectContaining({
          emailAddress: enrolledEmail,
        }))
      }

      expect(mockGoogleDrivePermissionsCreate).toHaveBeenCalledTimes(NEW_EMAILS.length)
    })

    it('writes to console.log on success sharing', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log')

      await shareDocumentWithStudents(FAKE_FILE_ID)

      for (const newEmail of NEW_EMAILS) {
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`[+] ${newEmail}`))
      }
    })

    it('throws an error if sharing fails', async () => {
      mockGoogleDrivePermissionsCreate.mockRejectedValue(
        new Error("Unknown error")
      );

      expect(shareDocumentWithStudents(FAKE_FILE_ID)).rejects.toBeInstanceOf(
        Error
      );

      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()

    });

    it('does not log new emails if sharing fails', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log')
      mockGoogleDrivePermissionsCreate.mockRejectedValue(
        new Error('Unknown error')
      )

      await shareDocumentWithStudents(FAKE_FILE_ID).catch(() => {
      })

      for (const newEmail of NEW_EMAILS) {
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining(`[+] ${newEmail}`))
      }
    });

    it('does not share email if wrong payment description.', async () => {
      mockLiqpayApi.mockImplementation((_, __, resolve) => {
        const paymentData = []
        for (const paidEmail of PAID_EMAILS) {
          paymentData.push({
            description: 'BAD DESCRIPTION',
            status: 'success',
            order_id: `${paidEmail} /// some unused text`
          })
        }
        resolve({data: paymentData})
      })

      await shareDocumentWithStudents(FAKE_FILE_ID)

      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()
    });

    it('does not share email if wrong payment order_id.', async () => {
      mockLiqpayApi.mockImplementation((_, __, resolve) => {
        const paymentData = []
        for (const paidEmail of PAID_EMAILS) {
          paymentData.push({
            description: EXPECTED_DESCRIPTION,
            status: 'success',
            order_id: `${paidEmail} //WRONG ID// some unused text`
          })
        }
        resolve({data: paymentData})
      })

      await shareDocumentWithStudents(FAKE_FILE_ID)

      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()
    });

    it('does not share email if status is not success.', async () => {
      mockLiqpayApi.mockImplementation((_, __, resolve) => {
        const paymentData = []
        for (const paidEmail of PAID_EMAILS) {
          paymentData.push({
            description: EXPECTED_DESCRIPTION,
            status: 'notSuccess',
            order_id: `${paidEmail} /// some unused text`
          })
        }
        resolve({data: paymentData})
      })

      await shareDocumentWithStudents(FAKE_FILE_ID)

      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()
    });
  })

  describe('when person paid and is in enrolled list', () => {
    const NEW_EMAILS = [];

    const ENROLLED_EMAILS = [
      'email1@email.email',
      'email2@email.email',
    ]

    const PAID_EMAILS = [
      ...NEW_EMAILS,
      ...ENROLLED_EMAILS
    ]

    beforeEach(() => {
      expect.hasAssertions()

      mockLiqpayApi.mockImplementation((_, __, resolve) => {
        const paymentData = []
        for (const paidEmail of PAID_EMAILS) {
          paymentData.push({
            description: EXPECTED_DESCRIPTION,
            status: 'success',
            order_id: `${paidEmail} /// some unused text`
          })
        }
        resolve({data: paymentData})
      })

      const enrolledEmails = ENROLLED_EMAILS.map((email) => ({emailAddress: email}))
      mockGoogleDrivePermissionsList.mockResolvedValue({
        data: {
          permissions: enrolledEmails
        }
      })

    })

    it('does not attempt to share with email', async () => {
      await shareDocumentWithStudents(FAKE_FILE_ID)
      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()
    })

    it('does not log emails', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log')

      await shareDocumentWithStudents(FAKE_FILE_ID)

      for (const paidEmail of PAID_EMAILS) {
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining(`[+] ${paidEmail}`))
      }
    });

  })

  describe('when person did not pay and is not in enrolled list', () => {

      const NEW_EMAILS = [];

      const ENROLLED_EMAILS = []

      const PAID_EMAILS = [
        ...NEW_EMAILS,
        ...ENROLLED_EMAILS
      ]

      beforeEach(() => {
        expect.hasAssertions()

        mockLiqpayApi.mockImplementation((_, __, resolve) => {
          const paymentData = []
          for (const paidEmail of PAID_EMAILS) {
            paymentData.push({
              description: EXPECTED_DESCRIPTION,
              status: 'success',
              order_id: `${paidEmail} /// some unused text`
            })
          }
          resolve({data: paymentData})
        })

        const enrolledEmails = ENROLLED_EMAILS.map((email) => ({emailAddress: email}))
        mockGoogleDrivePermissionsList.mockResolvedValue({
          data: {
            permissions: enrolledEmails
          }
        })
      })

    it('does not attempt to share document access', async () => {
      await shareDocumentWithStudents(FAKE_FILE_ID)

      expect(mockGoogleDrivePermissionsCreate).not.toHaveBeenCalled()
    })
  })

  describe('external services unavailability tests', () => {

    beforeEach(() => {
      expect.hasAssertions()
    })

    it('crashes when liqpay api rejects', async () => {
      mockLiqpayApi.mockImplementationOnce((_, __, resolve, reject) => {
        reject({errors: []})
      })

      await expect(shareDocumentWithStudents(FAKE_FILE_ID)).rejects.toMatchObject(
        expect.objectContaining({errors: []}));

      expect(mockGoogleDrivePermissionsList).not.toHaveBeenCalled()
    })

    it('crashes if jwt instantiating fails', async () => {
      const originalJWT = google.auth.JWT
      google.auth.JWT = jest.fn().mockImplementation(() => {
        throw new Error('could not instantiate')
      })

      await expect(shareDocumentWithStudents(FAKE_FILE_ID)).rejects.toThrow('could not instantiate')
      expect(mockGoogleDrivePermissionsList).not.toHaveBeenCalled()

      google.auth.JWT = originalJWT
    })

    it('crashes if jwt authorize fails', async () => {
      const originalJWT = google.auth.JWT
      google.auth.JWT = jest.fn().mockImplementation(function () {
        this.authorize = jest.fn().mockRejectedValue('could not authorize')
      })

      await expect(shareDocumentWithStudents(FAKE_FILE_ID)).rejects.toMatch('could not authorize')

      const [jwtInstance] = google.auth.JWT.mock.instances
      expect(jwtInstance.authorize).toHaveBeenCalled()
      expect(mockGoogleDrivePermissionsList).not.toHaveBeenCalled()

      google.auth.JWT = originalJWT
    })

    it('crashes if drive.permissions.list call fails', async () => {
      mockGoogleDrivePermissionsList.mockRejectedValueOnce('cannot get permissions list')

      await expect(shareDocumentWithStudents(FAKE_FILE_ID)).rejects.toBe('cannot get permissions list')

    })

  })
})