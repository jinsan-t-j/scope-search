package main

import "fmt"

type UserService struct {
	db Database
}

func NewUserService(db Database) *UserService {
	return &UserService{db: db}
}

func (s *UserService) FetchUser(id string) (*User, error) {
	user, err := s.db.FindByID(id)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return user, nil
}

func (s *UserService) UpdateUser(id string, data map[string]interface{}) (*User, error) {
	user, err := s.FetchUser(id)
	if err != nil {
		return nil, err
	}
	// update user fields
	return user, s.db.Save(user)
}

func (s *UserService) DeleteUser(id string) error {
	user, err := s.FetchUser(id)
	if err != nil {
		return err
	}
	return s.db.Remove(user)
}

func (s *UserService) ValidateEmail(email string) bool {
	for _, ch := range email {
		if ch == '@' {
			return true
		}
	}
	return false
}
